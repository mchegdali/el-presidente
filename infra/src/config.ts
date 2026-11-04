// Configuration de la pile. Valeurs non secrètes : Pulumi.<pile>.yaml. Secrets venus de
// l'extérieur : environnement Pulumi ESC (el-presidente/<pile>), jamais dans un fichier.

import * as pulumi from '@pulumi/pulumi';

const cfg = new pulumi.Config();

/** Une seule ligne « <algorithme> <base64> » (sortie de ssh-keyscan sans hôte ni commentaire). */
function hostKeyLine(value: string | undefined): string | undefined {
  if (
    value !== undefined &&
    !/^(ecdsa-sha2-nistp(256|384|521)|ssh-ed25519|rsa-sha2-(256|512)|ssh-rsa) [A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error('storageBoxHostKey : attendu « <algorithme> <base64> » sur une ligne (voir src/config.ts).');
  }
  return value;
}

export const config = {
  stack: pulumi.getStack(),
  location: cfg.get('location') ?? 'hel1',
  serverType: cfg.get('serverType') ?? 'cx23',
  /** Image Ubuntu LTS de Hetzner (vérifiée par getImage au déploiement). */
  osImage: cfg.get('osImage') ?? 'ubuntu-26.04',
  volumeSizeGb: cfg.getNumber('volumeSizeGb') ?? 10,
  /** Clés SSH enregistrées chez Hetzner : humaine (admin) et CI (déploiement seulement). */
  adminSshKey: cfg.get('adminSshKey') ?? 'desktop-windows',
  ciSshKey: cfg.get('ciSshKey') ?? 'el-presidente-ci',

  /** Zone DNS chez OVH et noms servis. */
  zone: cfg.require('zone'),
  apiSubdomain: cfg.require('apiSubdomain'),
  webSubdomain: cfg.require('webSubdomain'),
  /** Contact Let's Encrypt et VAPID, facultatif (sinon : compte ACME sans adresse, VAPID par l'URL du site). */
  acmeEmail: cfg.get('acmeEmail'),
  /** Annuaire ACME : production par défaut, staging pour une pile de test. */
  acmeCa: cfg.get('acmeCa'),
  /**
   * Clé d'hôte SSH de la Storage Box, commune à toutes les Storage Box. La clé **ECDSA** :
   * Litestream ne restreint pas l'algorithme et le client SSH de Go choisit ECDSA avant
   * ed25519 (une autre clé épinglée donne « host key mismatch »). Relevée une fois
   * (`ssh-keyscan -p 23 -t ecdsa <serveur>`), comparée à l'empreinte publiée par Hetzner
   * (docs.hetzner.com/storage/storage-box/general : SHA256:oDHZqKXn…O5c), puis enregistrée
   * dans Pulumi.<pile>.yaml. Sans elle, pas de réplication.
   */
  storageBoxHostKey: hostKeyLine(cfg.get('storageBoxHostKey')),

  /** Images publiées par la CI, par empreinte (ghcr.io/…@sha256:…). */
  images: cfg.requireObject<{ api: string; caddy: string; litestream: string }>('images'),

  vercelTeamId: cfg.require('vercelTeamId'),
  vercelProject: cfg.get('vercelProject') ?? 'el-presidente',

  // Secrets (ESC → pulumiConfig).
  googleClientId: cfg.requireSecret('googleClientId'),
  googleClientSecret: cfg.requireSecret('googleClientSecret'),
  vapidPublicKey: cfg.get('vapidPublicKey'),
  vapidPrivateKey: cfg.getSecret('vapidPrivateKey'),
};

export const apiDomain = `${config.apiSubdomain}.${config.zone}`;
export const webDomain = `${config.webSubdomain}.${config.zone}`;
