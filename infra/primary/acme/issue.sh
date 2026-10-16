#!/bin/bash
# Certificat ECDSA Let's Encrypt pour l'API, en mode « stateless » : HAProxy répond lui-même
# au défi HTTP-01 à partir de l'empreinte du compte (ACME_THUMBPRINT), sans fichier ni
# serveur web. Le certificat est rechargé à chaud par l'API runtime de HAProxy (aucune
# coupure). Renouvellement : tâche cron installée par acme.sh.
#
# HAProxy doit donc tourner avant l'émission, et il ne démarre pas sans certificat. D'où
# trois étapes, à lancer dans l'ordre lors de la première installation :
#   EMAIL=… ./issue.sh register      # affiche ACME_THUMBPRINT, à mettre dans ../.env
#   ./issue.sh placeholder           # certificat auto-signé temporaire si aucun n'existe
#   (docker compose up -d haproxy)
#   DOMAIN=api.el-presidente.chegdali.fr ./issue.sh issue
set -euo pipefail
ACME=/root/.acme.sh/acme.sh
CERTS=/srv/presidente/certs

case "${1:-}" in
  register)
    : "${EMAIL:?}"
    [ -x "$ACME" ] || curl -fsSL https://get.acme.sh | sh -s email="$EMAIL"
    "$ACME" --set-default-ca --server letsencrypt
    THUMB=$("$ACME" --register-account -m "$EMAIL" --server letsencrypt 2>&1 |
      sed -n "s/.*ACCOUNT_THUMBPRINT='\(.*\)'.*/\1/p")
    [ -n "$THUMB" ] || { echo "Empreinte du compte introuvable." >&2; exit 1; }
    echo "ACME_THUMBPRINT=$THUMB"
    ;;
  placeholder)
    if compgen -G "$CERTS/*.pem" >/dev/null; then
      echo "Un certificat est déjà présent dans $CERTS."
      exit 0
    fi
    install -d -m 750 -o 99 -g 999 "$CERTS"
    TMP=$(mktemp -d)
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 7 \
      -subj "/CN=placeholder" -keyout "$TMP/key" -out "$TMP/crt" 2>/dev/null
    cat "$TMP/crt" "$TMP/key" > "$CERTS/placeholder.pem"
    rm -rf "$TMP"
    chown 99:999 "$CERTS/placeholder.pem"
    chmod 640 "$CERTS/placeholder.pem"
    echo "Certificat temporaire : $CERTS/placeholder.pem (retiré par « issue »)."
    ;;
  issue)
    : "${DOMAIN:?}"
    "$ACME" --issue --stateless -d "$DOMAIN" --keylength ec-256 --server letsencrypt
    DEPLOY_HAPROXY_HOT_UPDATE=yes \
    DEPLOY_HAPROXY_STATS_SOCKET=/srv/presidente/run/haproxy/admin.sock \
    DEPLOY_HAPROXY_PEM_PATH="$CERTS" \
      "$ACME" --deploy -d "$DOMAIN" --ecc --deploy-hook haproxy
    if [ -e "$CERTS/placeholder.pem" ]; then
      rm "$CERTS/placeholder.pem"
      echo "Certificat temporaire retiré : redémarrer HAProxy (docker compose restart haproxy)."
    fi
    ;;
  *)
    echo "usage : $0 register | placeholder | issue" >&2
    exit 2
    ;;
esac
