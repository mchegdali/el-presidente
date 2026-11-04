// Serveur unique : pare-feu, volume de données (base SQLite, certificats), cloud-init.
// Le serveur est jetable : aucune sauvegarde Hetzner ni instantané (les données sont sur
// le volume et dans la Storage Box), remplacé à chaque changement de cloud-init.

import * as hcloud from '@pulumi/hcloud';
import * as pulumi from '@pulumi/pulumi';
import * as tls from '@pulumi/tls';
import { cloudInit } from './cloud-init';
import { config } from './config';

const name = `presidente-${config.stack}`;
const labels = { app: 'el-presidente', stack: config.stack };

const adminKey = hcloud.getSshKeyOutput({ name: config.adminSshKey });
const ciKey = hcloud.getSshKeyOutput({ name: config.ciSshKey });

// Image vérifiée au déploiement : échoue si Hetzner ne la propose plus.
const image = hcloud.getImageOutput({ name: config.osImage, withArchitecture: 'x86' });

const firewall = new hcloud.Firewall(name, {
  labels,
  rules: [
    { direction: 'in', protocol: 'tcp', port: '22', sourceIps: ['0.0.0.0/0', '::/0'] },
    { direction: 'in', protocol: 'tcp', port: '80', sourceIps: ['0.0.0.0/0', '::/0'] },
    { direction: 'in', protocol: 'tcp', port: '443', sourceIps: ['0.0.0.0/0', '::/0'] },
    { direction: 'in', protocol: 'udp', port: '443', sourceIps: ['0.0.0.0/0', '::/0'] },
    { direction: 'in', protocol: 'icmp', sourceIps: ['0.0.0.0/0', '::/0'] },
  ],
});

// Supprimer le volume, c'est perdre la base : protégé contre la suppression.
const volume = new hcloud.Volume(
  `${name}-data`,
  { location: config.location, size: config.volumeSizeGb, format: 'ext4', deleteProtection: true, labels },
  { protect: true },
);

/** Clé d'hôte SSH du serveur, connue avant sa création : épinglée par les clients. */
export const hostKey = new tls.PrivateKey(`${name}-host`, { algorithm: 'ED25519' });

export const server = new hcloud.Server(
  name,
  {
    serverType: config.serverType,
    image: image.apply((i) => String(i.id)),
    location: config.location,
    // Clé humaine seulement : Hetzner n'envoie pas de mot de passe root par courriel.
    // Jamais la clé de la CI ici (elle donnerait un accès root).
    sshKeys: [adminKey.apply((k) => String(k.id))],
    firewallIds: [firewall.id.apply(Number)],
    publicNets: [{ ipv4Enabled: true, ipv6Enabled: true }],
    backups: false,
    labels,
    userData: pulumi
      .all([adminKey.publicKey, ciKey.publicKey, hostKey.privateKeyOpenssh, hostKey.publicKeyOpenssh, volume.id])
      .apply(([admin, ci, priv, pub, volumeId]) =>
        cloudInit({
          adminKey: admin,
          deployKeys: [ci, admin],
          hostKey: { privateOpenssh: priv, publicOpenssh: pub.trim() },
          volumeId: Number(volumeId),
        }),
      ),
  },
  // L'ancien serveur est supprimé avant la création du nouveau : le volume ne s'attache
  // qu'à un serveur à la fois, et le nom est réutilisé.
  { deleteBeforeReplace: true },
);

export const attachment = new hcloud.VolumeAttachment(name, {
  serverId: server.id.apply(Number),
  volumeId: volume.id.apply(Number),
  automount: false,
});

export const ipv4 = server.ipv4Address;
export const ipv6 = server.ipv6Address;
