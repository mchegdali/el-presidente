#!/bin/bash
# Installe le timer de sauvegarde quotidienne (03:17 UTC) sur le standby.
set -euo pipefail
install -m 755 "$(dirname "$0")/pg-dump.sh" /usr/local/bin/presidente-pg-dump
cat > /etc/systemd/system/presidente-backup.service <<'UNIT'
[Unit]
Description=Sauvegarde Postgres d'El Presidente
[Service]
Type=oneshot
ExecStart=/usr/local/bin/presidente-pg-dump
UNIT
cat > /etc/systemd/system/presidente-backup.timer <<'UNIT'
[Unit]
Description=Sauvegarde quotidienne d'El Presidente
[Timer]
OnCalendar=*-*-* 03:17:00 UTC
Persistent=true
RandomizedDelaySec=300
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now presidente-backup.timer
