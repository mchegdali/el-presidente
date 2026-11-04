#!/bin/bash
# Banc des proxys — préparation du serveur testé (CX23). Jetable avec le serveur.
#   ./setup-sut.sh   (root, depuis infra/bench/proxies)
set -euo pipefail
cd "$(dirname "$0")"

apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -yq docker.io docker-compose-v2 openssl

# Mêmes réglages noyau que la cible (infra/src/cloud-init.ts), recopiés ici.
cat > /etc/sysctl.d/99-presidente.conf <<'SYS'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_notsent_lowat = 16384
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_fastopen = 3
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.ip_local_port_range = 10240 65535
fs.file-max = 1048576
net.ipv4.ip_unprivileged_port_start = 80
vm.swappiness = 10
SYS
sysctl --system >/dev/null
cat > /etc/security/limits.d/99-presidente.conf <<'LIM'
* soft nofile 65536
* hard nofile 65536
LIM

# Dossiers des sockets Unix partagées entre conteneurs (banc : ouverts à tous).
install -d -m 777 /srv/bench/run/api /srv/bench/run/pg

# Certificat ECDSA P-256 auto-signé, commun aux trois proxys.
install -d certs
if [ ! -f certs/bench.key ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 30 \
    -subj "/CN=10.0.0.3" -addext "subjectAltName=IP:10.0.0.3" \
    -keyout certs/bench.key -out certs/bench.crt 2>/dev/null
  cat certs/bench.crt certs/bench.key > certs/bench.pem
  chmod 644 certs/*
fi

systemctl enable --now docker
echo "SUT prêt : $(docker --version), $(docker compose version --short)"
