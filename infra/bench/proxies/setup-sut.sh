#!/bin/bash
# Banc des proxys — préparation du serveur testé (CX23). Jetable avec le serveur.
#   ./setup-sut.sh   (root, depuis infra/bench/proxies)
set -euo pipefail
cd "$(dirname "$0")"

apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -yq docker.io docker-compose-v2 openssl

# Mêmes réglages noyau que la cible (infra/system/99-presidente.conf), sans les pages
# énormes réservées à Postgres (le banc garde la configuration Postgres par défaut).
grep -v -E '^vm\.nr_hugepages' ../../system/99-presidente.conf > /etc/sysctl.d/99-presidente.conf
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
