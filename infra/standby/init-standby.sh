#!/bin/bash
# Initialise le standby par copie du primaire (pg_basebackup), avec le slot « standby »
# créé au premier démarrage du primaire. À lancer sur CX23 n°2, dossier de données vide.
#   PRIMARY_IP=10.0.0.2 ./init-standby.sh
set -euo pipefail
: "${PRIMARY_IP:?adresse privée du primaire}"
DATA=/srv/presidente/pgdata
if [ -n "$(ls -A "$DATA" 2>/dev/null)" ]; then
  echo "$DATA n'est pas vide : abandon." >&2
  exit 1
fi
install -d -o 999 -g 999 -m 700 "$DATA"
docker run --rm --network host -v "$DATA:/var/lib/postgresql/data" -e PGPASSWORD="$(cat /etc/presidente/pg_replicator)" \
  -u 999:999 postgres:17.6-bookworm \
  pg_basebackup -h "$PRIMARY_IP" -U replicator -D /var/lib/postgresql/data \
  --slot=standby --write-recovery-conf --wal-method=stream --checkpoint=fast --progress \
  -d "sslmode=require"
echo "Standby initialisé. Démarrer : docker compose up -d"
