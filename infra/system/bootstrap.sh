#!/bin/bash
# Préparation d'un CX23 (Ubuntu 24.04), à lancer une fois en root :
#   ROLE=primary ./bootstrap.sh   (ou ROLE=standby)
# Idempotent : peut être relancé sans dommage.
set -euo pipefail
: "${ROLE:?primary ou standby}"
DEPLOY_USER=deploy

# Mises à jour de sécurité automatiques.
apt-get update -q
apt-get install -yq unattended-upgrades ca-certificates curl gnupg jq
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker (dépôt officiel).
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q && apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Utilisateur de déploiement (clé SSH seulement), membre du groupe docker.
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

# SSH : clés uniquement, pas de root.
cat > /etc/ssh/sshd_config.d/99-presidente.conf <<'SSH'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSH
systemctl reload ssh

# Noyau : réseau, mémoire, pages énormes ; THP en « madvise » (recommandé pour Postgres).
install -m 644 "$(dirname "$0")/99-presidente.conf" /etc/sysctl.d/99-presidente.conf
sysctl --system >/dev/null
cat > /etc/systemd/system/thp-madvise.service <<'UNIT'
[Unit]
Description=Transparent huge pages en madvise
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo madvise > /sys/kernel/mm/transparent_hugepage/enabled'
[Install]
WantedBy=multi-user.target
UNIT
systemctl enable --now thp-madvise.service
cat > /etc/security/limits.d/99-presidente.conf <<'LIM'
* soft nofile 65536
* hard nofile 65536
LIM

# Dossiers partagés : groupe 999 (Postgres dans l'image officielle) = accès aux sockets.
install -d -m 750 /srv/presidente /etc/presidente
install -d -m 700 -o 999 -g 999 /srv/presidente/pgdata
install -d -m 2770 -o 999 -g 999 /srv/presidente/run /srv/presidente/run/postgresql
if [ "$ROLE" = primary ]; then
  install -d -m 2770 -o 65532 -g 999 /srv/presidente/run/presidente
  install -d -m 2770 -o 99 -g 999 /srv/presidente/run/haproxy
  install -d -m 750 -o 99 -g 999 /srv/presidente/certs
fi
echo "Préparation terminée ($ROLE)."
