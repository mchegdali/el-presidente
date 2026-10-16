#!/bin/bash
# Sauvegarde quotidienne, exécutée sur le standby (n°2) pour ne pas charger le primaire.
# Format « custom » compressé (zstd), rotation sur 7 jours, vérification de lisibilité.
# Installée par backup/install.sh (timer systemd).
set -euo pipefail
DIR=/srv/presidente/backups
KEEP_DAYS=7
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$DIR"
docker exec -u postgres presidente-standby-postgres-1 \
  pg_dump -h /var/run/postgresql -d presidente --format=custom --compress=zstd:6 > "$DIR/presidente-$STAMP.dump.tmp"
# Un fichier illisible ne remplace jamais une bonne sauvegarde.
docker exec -i -u postgres presidente-standby-postgres-1 pg_restore --list < "$DIR/presidente-$STAMP.dump.tmp" > /dev/null
mv "$DIR/presidente-$STAMP.dump.tmp" "$DIR/presidente-$STAMP.dump"
find "$DIR" -name 'presidente-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Sauvegarde : $DIR/presidente-$STAMP.dump ($(du -h "$DIR/presidente-$STAMP.dump" | cut -f1))"
