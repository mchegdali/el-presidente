// Configuration de la pile. Valeurs non secrètes : Pulumi.<pile>.yaml. Secrets venus de
// l'extérieur : environnement Pulumi ESC (el-presidente/<pile>), jamais dans un fichier.

import * as pulumi from '@pulumi/pulumi';

const cfg = new pulumi.Config();

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
  acmeEmail: cfg.require('acmeEmail'),
  /** Annuaire ACME : production par défaut, staging pour une pile de test. */
  acmeCa: cfg.get('acmeCa'),
  /**
   * Clé d'hôte SSH de la Storage Box (« ssh-ed25519 AAAA… »). Hetzner ne la publie pas :
   * relevée une fois (`ssh-keyscan -p 23 <serveur>`), comparée à l'empreinte affichée
   * dans la console Hetzner, puis enregistrée ici. Sans elle, pas de réplication.
   */
  storageBoxHostKey: cfg.get('storageBoxHostKey'),

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
