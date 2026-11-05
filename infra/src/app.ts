// Conteneurs, déployés par l'API Docker du serveur à travers SSH (utilisateur `deploy`,
// limité à `docker system dial-stdio`). Ordre : restauration (une fois, si la base n'existe
// pas encore et qu'une réplique existe) → API → Litestream → Caddy ; surveillance à côté
// (VictoriaMetrics, vmalert, node_exporter) sur un réseau Docker interne, sans Internet.
//
// Durcissement commun : système de fichiers en lecture seule, /tmp en mémoire, aucune
// capacité, pas d'élévation de privilèges, utilisateur non root (fixé par chaque image).
// Les secrets n'existent que dans l'environnement des conteneurs (état Pulumi chiffré) :
// ni fichier .env, ni dossier de configuration sur le serveur.

import * as docker from '@pulumi/docker';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storageBox } from './backup';
import { apiDomain, config, webDomain } from './config';
import { attachment, hostKey, ipv4, server } from './server';

const DB = '/data/db/presidente.db';

/**
 * Hôte SSH du fournisseur Docker. Avant de le rendre : la clé d'hôte épinglée est écrite
 * dans un known_hosts dédié, et on attend que cloud-init ait démarré Docker (premier
 * déploiement). `dial-stdio` répond 0 dès que le démon Docker accepte la connexion.
 */
const sshTarget = pulumi.all([ipv4, hostKey.publicKeyOpenssh, attachment.id]).apply(([ip, pub]) => {
  const dir = join(tmpdir(), `presidente-${config.stack}`);
  mkdirSync(dir, { recursive: true });
  const knownHosts = join(dir, 'known_hosts');
  writeFileSync(knownHosts, `${ip} ${pub.trim()}\n`);
  const opts = ['-o', `UserKnownHostsFile=${knownHosts}`, '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes'];
  if (!pulumi.runtime.isDryRun()) waitForDocker(ip, opts);
  return { host: `ssh://deploy@${ip}`, opts };
});

function waitForDocker(ip: string, opts: string[]): void {
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const r = spawnSync('ssh', [...opts, '-o', 'ConnectTimeout=5', `deploy@${ip}`], { input: '', timeout: 15_000 });
    if (r.status === 0) return;
    if (Date.now() > deadline) throw new Error(`Docker injoignable sur ${ip} : ${String(r.stderr).trim()}`);
    Bun.sleepSync(5000);
  }
}

const provider = new docker.Provider('server', {
  host: sshTarget.host,
  sshOpts: sshTarget.opts,
  // Images privées de GHCR : jeton fourni par l'environnement (GITHUB_TOKEN en CI).
  registryAuth: [
    {
      address: 'ghcr.io',
      username: process.env.GHCR_USER ?? 'mchegdali',
      password: pulumi.secret(process.env.GHCR_TOKEN ?? ''),
    },
  ],
});
// Nouveau serveur ou nouveau volume (l'identifiant du rattachement est celui du volume) :
// images et conteneurs recréés. Sans ce déclencheur,
// l'empreinte des images ne change pas et Pulumi croirait les conteneurs déjà présents.
const opts = { provider, replacementTrigger: pulumi.interpolate`${server.id}/${attachment.id}` };

const pull = (id: string, ref: string) => new docker.RemoteImage(id, { name: ref, keepLocally: true }, opts).imageId;

const images = {
  api: pull('api', config.images.api),
  caddy: pull('caddy', config.images.caddy),
  litestream: pull('litestream', config.images.litestream),
};

// Surveillance : images facultatives (publiées par la CI).
const monitoringRefs = config.images.victoriametrics && config.images.vmalert && config.images.nodeExporter;
if (!monitoringRefs) pulumi.log.warn('Images de surveillance absentes de `images` : aucune surveillance déployée.');

/**
 * Réseau de la surveillance : interne (aucun accès à Internet), sous-réseau fixe pour joindre
 * VictoriaMetrics par un tunnel SSH (`ssh -N -L 8428:10.89.0.10:8428 admin@…`). L'API et
 * Litestream y sont branchés en plus du réseau par défaut, qui leur garde l'accès sortant.
 */
const MONITORING_SUBNET = '10.89.0.0/24';
const VICTORIAMETRICS_IP = '10.89.0.10';
const monitoringNet = new docker.Network(
  'monitoring',
  { name: 'presidente-monitoring', internal: true, ipamConfigs: [{ subnet: MONITORING_SUBNET }] },
  opts,
);
const onMonitoring = {
  networkMode: 'bridge',
  networksAdvanced: [{ name: monitoringNet.name }],
} satisfies Partial<docker.ContainerArgs>;
/** Port de l'écoute interne de l'API (métriques, alertes), jamais publié. */
const API_INTERNAL_PORT = 9464;

const hardened = {
  readOnly: true,
  tmpfs: { '/tmp': 'rw,noexec,nosuid,size=64m' },
  capabilities: { drops: ['ALL'] },
  securityOpts: ['no-new-privileges:true'],
  logDriver: 'local',
} satisfies Partial<docker.ContainerArgs>;

const bind = (source: string, target: string) => ({ type: 'bind', source, target });

/** Mémoire en Mo, sans swap (sinon Docker fixe le swap au double, vu comme une dérive). */
const limit = (mb: number) => ({ memory: mb, memorySwap: mb });

// Sans clé d'hôte vérifiée, pas de connexion à la Storage Box : réplication et restauration
// attendent qu'elle soit enregistrée (premier déploiement, voir infra/README.md).
const hostKeyKnown = config.storageBoxHostKey !== undefined;
if (!hostKeyKnown) {
  pulumi.log.warn(
    "storageBoxHostKey manquante : AUCUNE réplication de la base. Relever la clé d'hôte de la " +
      'Storage Box (voir src/config.ts), `pulumi config set storageBoxHostKey "ecdsa-sha2-nistp521 AAAA…"`, puis `pulumi up`.',
  );
}
const litestreamEnv = pulumi
  .all([storageBox.host, storageBox.user, storageBox.password])
  .apply(([host, user, password]) => [
    `STORAGE_BOX_HOST=${host}`,
    `STORAGE_BOX_USER=${user}`,
    `STORAGE_BOX_PASSWORD=${password}`,
    `STORAGE_BOX_HOST_KEY=${config.storageBoxHostKey}`,
  ]);

// Restauration après sinistre : ne fait rien si la base existe (cas normal, volume conservé)
// ou si aucune réplique n'existe (premier déploiement). Exécutée jusqu'à son terme.
const restore = hostKeyKnown
  ? [
      new docker.Container(
        'restore',
        {
          ...hardened,
          name: 'presidente-restore',
          image: images.litestream,
          command: ['restore', '-if-db-not-exists', '-if-replica-exists', DB],
          envs: litestreamEnv,
          mounts: [bind('/data/db', '/data/db')],
          mustRun: false,
          attach: true,
          logs: true,
          restart: 'no',
        },
        opts,
      ),
    ]
  : [];

const authSecret = new random.RandomPassword('better-auth-secret', { length: 48, special: false });
const metricsToken = new random.RandomPassword('metrics-token', { length: 32, special: false });

const apiEnv = pulumi
  .all([
    authSecret.result,
    metricsToken.result,
    config.googleClientId,
    config.googleClientSecret,
    config.vapidPrivateKey,
  ])
  .apply(([auth, metrics, googleId, googleSecret, vapidPrivate]) => [
    `API_ORIGIN=https://${apiDomain}`,
    `WEB_ORIGIN=https://${webDomain}`,
    `COOKIE_DOMAIN=${config.zone}`,
    `BETTER_AUTH_SECRET=${auth}`,
    `METRICS_TOKEN=${metrics}`,
    `METRICS_PORT=${API_INTERNAL_PORT}`,
    `ADMIN_EMAILS=${config.adminEmails}`,
    `GOOGLE_CLIENT_ID=${googleId}`,
    `GOOGLE_CLIENT_SECRET=${googleSecret}`,
    ...(config.vapidPublicKey && vapidPrivate
      ? [
          `VAPID_PUBLIC_KEY=${config.vapidPublicKey}`,
          `VAPID_PRIVATE_KEY=${vapidPrivate}`,
          `VAPID_SUBJECT=${config.acmeEmail ? `mailto:${config.acmeEmail}` : `https://${webDomain}`}`,
        ]
      : []),
  ]);

const api = new docker.Container(
  'api',
  {
    ...hardened,
    name: 'presidente-api',
    image: images.api,
    envs: apiEnv,
    mounts: [bind('/data/db', '/data/db'), bind('/run/presidente', '/run/presidente')],
    ...onMonitoring,
    ...limit(1536),
    restart: 'unless-stopped',
    // Le temps d'écrire les manches en attente et de fermer la base.
    stopTimeout: 30,
  },
  { ...opts, dependsOn: restore },
);

if (hostKeyKnown) {
  new docker.Container(
    'litestream',
    {
      ...hardened,
      name: 'presidente-litestream',
      image: images.litestream,
      envs: litestreamEnv,
      mounts: [bind('/data/db', '/data/db')],
      ...onMonitoring,
      ...limit(256),
      restart: 'unless-stopped',
    },
    { ...opts, dependsOn: [api] },
  );
}

if (monitoringRefs) {
  const internalOnly = { networksAdvanced: [{ name: monitoringNet.name }] };

  // Données de VictoriaMetrics sur le disque du serveur (volume Docker nommé, initialisé par
  // l'image) : l'historique (30 jours) repart de zéro au remplacement du serveur.
  const metricsVolume = new docker.Volume('metrics', { name: 'presidente-metrics' }, opts);
  new docker.Container(
    'victoriametrics',
    {
      ...hardened,
      name: 'presidente-victoriametrics',
      image: pull('victoriametrics', config.images.victoriametrics!),
      envs: [pulumi.interpolate`METRICS_TOKEN=${metricsToken.result}`],
      mounts: [{ type: 'volume', source: metricsVolume.name, target: '/storage' }],
      networksAdvanced: [{ name: monitoringNet.name, ipv4Address: VICTORIAMETRICS_IP }],
      ...limit(256),
      restart: 'unless-stopped',
    },
    { ...opts, dependsOn: [api] },
  );

  new docker.Container(
    'vmalert',
    {
      ...hardened,
      name: 'presidente-vmalert',
      image: pull('vmalert', config.images.vmalert!),
      envs: [pulumi.interpolate`notifier_bearerToken=${metricsToken.result}`],
      ...internalOnly,
      ...limit(64),
      restart: 'unless-stopped',
    },
    { ...opts, dependsOn: [api] },
  );

  // Seulement le volume /data (lecture seule) : /proc et /sys du conteneur suffisent pour la
  // mémoire et le processeur, qui ne sont pas isolés par Docker.
  new docker.Container(
    'node-exporter',
    {
      ...hardened,
      name: 'presidente-node-exporter',
      image: pull('node-exporter', config.images.nodeExporter!),
      command: [
        '--collector.disable-defaults',
        '--collector.filesystem',
        '--collector.meminfo',
        '--collector.cpu',
        '--collector.loadavg',
        '--collector.filesystem.mount-points-include=^/host/data$',
      ],
      mounts: [{ ...bind('/data', '/host/data'), readOnly: true }],
      ...internalOnly,
      ...limit(64),
      restart: 'unless-stopped',
    },
    opts,
  );
}

new docker.Container(
  'caddy',
  {
    ...hardened,
    name: 'presidente-caddy',
    image: images.caddy,
    networkMode: 'host',
    tmpfs: { ...hardened.tmpfs, '/config': 'rw,noexec,nosuid,size=8m' },
    envs: [
      `API_DOMAIN=${apiDomain}`,
      ...(config.acmeEmail ? [`ACME_EMAIL_OPTION=email ${config.acmeEmail}`] : []),
      ...(config.acmeCa ? [`ACME_CA=${config.acmeCa}`] : []),
    ],
    mounts: [bind('/data/caddy', '/data'), bind('/run/presidente', '/run/presidente')],
    ...limit(256),
    restart: 'unless-stopped',
  },
  { ...opts, dependsOn: [api] },
);
