#!/bin/bash
# Sur le primaire : tire l'image, applique les migrations, redémarre l'API.
# L'API s'arrête proprement (écrit les manches en attente) ; les clients se reconnectent
# seuls (reconnexion avec gigue) et reçoivent un état complet.
#   API_TAG=<sha> ./deploy.sh
set -euo pipefail
: "${API_TAG:?}"
export API_TAG
cd "$(dirname "$0")"
docker compose pull api
docker compose run --rm --no-deps api migrate
docker compose up -d --no-deps api
for i in $(seq 1 30); do
  # Par HAProxy en local : vérifie aussi la chaîne TLS → socket → API.
  if curl -fsSk https://127.0.0.1/health >/dev/null; then
    echo "API $API_TAG en ligne."
    exit 0
  fi
  sleep 1
done
echo "L'API ne répond pas après 30 s." >&2
docker compose logs --tail 50 api >&2
exit 1
