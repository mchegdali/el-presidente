#!/bin/bash
# Certificat ECDSA Let's Encrypt pour l'API, en mode « stateless » : HAProxy répond lui-même
# au défi HTTP-01 à partir de l'empreinte du compte (ACME_THUMBPRINT), sans fichier ni
# serveur web. Le certificat est rechargé à chaud par l'API runtime de HAProxy (aucune
# coupure). Renouvellement : tâche cron installée par acme.sh.
#   DOMAIN=api.el-presidente.chegdali.fr EMAIL=… ./issue.sh
set -euo pipefail
: "${DOMAIN:?}" "${EMAIL:?}"
ACME=/root/.acme.sh/acme.sh
[ -x "$ACME" ] || curl -fsSL https://get.acme.sh | sh -s email="$EMAIL"
"$ACME" --set-default-ca --server letsencrypt
"$ACME" --register-account -m "$EMAIL" --server letsencrypt
THUMB=$("$ACME" --register-account -m "$EMAIL" --server letsencrypt 2>&1 | sed -n "s/.*ACCOUNT_THUMBPRINT='\(.*\)'.*/\1/p")
echo "ACME_THUMBPRINT=$THUMB  (à placer dans l'environnement du compose, puis relancer HAProxy)"
"$ACME" --issue --stateless -d "$DOMAIN" --keylength ec-256 --server letsencrypt
DEPLOY_HAPROXY_HOT_UPDATE=yes \
DEPLOY_HAPROXY_STATS_SOCKET=/srv/presidente/run/haproxy/admin.sock \
DEPLOY_HAPROXY_PEM_PATH=/srv/presidente/certs \
  "$ACME" --deploy -d "$DOMAIN" --ecc --deploy-hook haproxy
