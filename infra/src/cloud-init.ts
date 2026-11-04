// cloud-init du serveur, généré ici. Les données utilisateur restent lisibles depuis le
// serveur (service de métadonnées) : elles ne contiennent aucun secret de l'application.
// Seule exception, la clé d'hôte SSH du serveur lui-même (pour l'épingler côté client,
// sans « trust on first use ») : le service de métadonnées est fermé à tout sauf root.

export interface CloudInitInput {
  adminKey: string;
  /** Clés autorisées pour `deploy`, limitées à l'API Docker (`docker system dial-stdio`). */
  deployKeys: string[];
  hostKey: { privateOpenssh: string; publicOpenssh: string };
  volumeId: number;
}

const DOCKER_GPG_FINGERPRINT = '9DC858229FC7DD38854AE2D88D81803C0EBFCD88';

/** Groupe partagé par l'API, Litestream et Caddy (socket de l'API). */
export const APP_GID = 10000;
export const API_UID = 65532;
export const CADDY_UID = 65533;

const SYSCTL = `# Réseau d'un serveur de jeu temps réel (WebSocket).
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
# Petites écritures WebSocket envoyées sans attendre de remplir le tampon.
net.ipv4.tcp_notsent_lowat = 16384
# Pas de retour au démarrage lent sur une WebSocket restée inactive.
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_fastopen = 3
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.ip_local_port_range = 10240 65535
fs.file-max = 1048576
# Caddy (non root) écoute sur 80 et 443 ; SSH (22) reste privilégié.
net.ipv4.ip_unprivileged_port_start = 80
vm.swappiness = 10
`;

const DAEMON_JSON = JSON.stringify(
  {
    'no-new-privileges': true,
    'live-restore': true,
    'userland-proxy': false,
    icc: false,
    'log-driver': 'local',
    'log-opts': { 'max-size': '20m', 'max-file': '5' },
  },
  null,
  2,
);

const SSHD = `PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers admin deploy
`;

const UNATTENDED = `Unattended-Upgrade::Origins-Pattern {
        "origin=Docker,codename=\${distro_codename}";
};
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
`;

/** Métadonnées Hetzner réservées à root (données utilisateur = clé d'hôte SSH). */
const METADATA_LOCK = `[Unit]
Description=Service de métadonnées réservé à root
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/iptables -I OUTPUT -d 169.254.169.254 -m owner ! --uid-owner 0 -j REJECT
ExecStart=/usr/sbin/iptables -I DOCKER-USER -d 169.254.169.254 -j REJECT

[Install]
WantedBy=multi-user.target
`;

export function cloudInit(input: CloudInitInput): string {
  const device = `/dev/disk/by-id/scsi-0HC_Volume_${input.volumeId}`;
  const config = {
    package_update: true,
    package_upgrade: true,
    ssh_pwauth: false,
    disable_root: true,
    ssh_deletekeys: true,
    // Seule la clé fournie : aucune autre clé d'hôte générée.
    ssh_genkeytypes: ['ed25519'],
    ssh_keys: { ed25519_private: input.hostKey.privateOpenssh, ed25519_public: input.hostKey.publicOpenssh },
    users: [
      {
        name: 'admin',
        groups: ['sudo'],
        shell: '/bin/bash',
        sudo: 'ALL=(ALL) NOPASSWD:ALL',
        lock_passwd: true,
        ssh_authorized_keys: [input.adminKey],
      },
      {
        name: 'deploy',
        shell: '/bin/bash',
        lock_passwd: true,
        ssh_authorized_keys: input.deployKeys.map((k) => `restrict,command="docker system dial-stdio" ${k}`),
      },
    ],
    apt: {
      sources: {
        docker: {
          source: 'deb [arch=amd64 signed-by=$KEY_FILE] https://download.docker.com/linux/ubuntu $RELEASE stable',
          keyid: DOCKER_GPG_FINGERPRINT,
          keyserver: 'keyserver.ubuntu.com',
        },
      },
    },
    packages: ['docker-ce', 'docker-ce-cli', 'containerd.io', 'unattended-upgrades'],
    write_files: [
      { path: '/etc/sysctl.d/99-presidente.conf', content: SYSCTL },
      { path: '/etc/docker/daemon.json', content: DAEMON_JSON },
      { path: '/etc/ssh/sshd_config.d/10-presidente.conf', content: SSHD },
      { path: '/etc/apt/apt.conf.d/52-presidente', content: UNATTENDED },
      { path: '/etc/systemd/system/metadata-lock.service', content: METADATA_LOCK },
      { path: '/etc/tmpfiles.d/presidente.conf', content: `d /run/presidente 2770 root ${APP_GID} -\n` },
      { path: '/etc/security/limits.d/90-presidente.conf', content: '* soft nofile 65536\n* hard nofile 65536\n' },
    ],
    // Volume : monté s'il est là (l'attachement suit la création du serveur), sinon attendu.
    mounts: [[device, '/data', 'ext4', 'defaults,nofail,discard,x-systemd.device-timeout=120s', '0', '2']],
    runcmd: [
      'sysctl --system',
      'systemd-tmpfiles --create /etc/tmpfiles.d/presidente.conf',
      `for i in $(seq 1 120); do [ -e ${device} ] && break; sleep 1; done`,
      'mountpoint -q /data || mount /data',
      `install -d -m 0750 -o ${API_UID} -g ${APP_GID} /data/db`,
      `install -d -m 0700 -o ${CADDY_UID} -g ${APP_GID} /data/caddy`,
      'usermod -aG docker deploy',
      'systemctl daemon-reload',
      'systemctl restart docker',
      'systemctl enable --now metadata-lock.service',
      'systemctl restart ssh',
    ],
  };
  return `#cloud-config\n${JSON.stringify(config, null, 2)}\n`;
}
