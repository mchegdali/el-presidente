#!/usr/bin/env bash
# Essai de la surveillance en CI (Docker requis), comme sur le serveur : réseau interne,
# API branchée sur deux réseaux, volume nommé pour VictoriaMetrics. Vérifie :
#   - règles de vmalert et configuration de collecte valides (dryRun) ;
#   - cibles collectées « up » (api, node, vmalert, victoriametrics) ;
#   - alerte reçue par l'API avec le jeton (journal « alertes sans destinataire »).
# Usage : infra/images/monitoring/smoke.sh   (depuis la racine du dépôt)
set -euo pipefail

TOKEN=smoke-metrics-token-0123456789
NET=smoke-monitoring
VOL=smoke-metrics
CURL=curlimages/curl:8.22.0

cleanup() {
  docker rm -f smoke-api presidente-api presidente-victoriametrics presidente-vmalert presidente-node-exporter >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker volume rm "$VOL" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

echo '== Images'
docker build -q -t smoke/api -f infra/images/api.Dockerfile . >/dev/null
for img in victoriametrics vmalert node-exporter litestream; do
  docker build -q -t "smoke/$img" -f "infra/images/$img.Dockerfile" infra/images >/dev/null
done

echo '== Règles et configuration'
docker run --rm --entrypoint /vmalert-prod smoke/vmalert -dryRun -rule=/etc/vmalert/rules.yml
docker run --rm -e METRICS_TOKEN=x --entrypoint /victoria-metrics-prod smoke/victoriametrics \
  -promscrape.config=/etc/victoriametrics/scrape.yml -promscrape.config.strictParse=true -promscrape.config.dryRun
docker run --rm smoke/node-exporter --version

echo '== Conteneurs'
hardened=(--read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL --security-opt no-new-privileges:true)
docker network create --internal --subnet 10.89.0.0/24 "$NET" >/dev/null
docker volume create "$VOL" >/dev/null

# API : réseau par défaut (accès sortant) + réseau interne, en TCP (pas de socket Caddy ici).
docker run -d --name presidente-api "${hardened[@]}" --network bridge \
  -e NODE_ENV=production -e LISTEN_UNIX= -e PORT=4000 -e DATABASE_PATH=/tmp/presidente.db \
  -e API_ORIGIN=https://api.smoke.test -e WEB_ORIGIN=https://smoke.test \
  -e BETTER_AUTH_SECRET=smoke-secret-smoke-secret-smoke-secret-12 \
  -e GOOGLE_CLIENT_ID=x -e GOOGLE_CLIENT_SECRET=x \
  -e METRICS_TOKEN=$TOKEN -e METRICS_PORT=9464 -e ADMIN_EMAILS= \
  smoke/api >/dev/null
docker network connect "$NET" presidente-api

docker run -d --name presidente-victoriametrics "${hardened[@]}" --network "$NET" --ip 10.89.0.10 \
  -e METRICS_TOKEN=$TOKEN -v "$VOL:/storage" smoke/victoriametrics >/dev/null
docker run -d --name presidente-vmalert "${hardened[@]}" --network "$NET" \
  -e notifier_bearerToken=$TOKEN smoke/vmalert >/dev/null
docker run -d --name presidente-node-exporter "${hardened[@]}" --network "$NET" \
  -v /tmp:/host/data:ro smoke/node-exporter \
  --collector.disable-defaults --collector.filesystem --collector.meminfo --collector.cpu --collector.loadavg \
  '--collector.filesystem.mount-points-include=^/host/data$' >/dev/null

oncurl() { docker run --rm --network "$NET" "$CURL" -fsS --max-time 5 "$@"; }

echo '== Cibles collectées'
want='api node victoriametrics vmalert'
for i in $(seq 1 30); do
  up=$(oncurl 'http://10.89.0.10:8428/api/v1/query?query=up' |
    python3 -c 'import json,sys; print(" ".join(sorted(r["metric"]["job"] for r in json.load(sys.stdin)["data"]["result"] if r["value"][1]=="1")))' || true)
  [ "$up" = "$want" ] && break
  sleep 5
done
echo "up : $up"
[ "$up" = "$want" ] || { docker logs presidente-victoriametrics | tail -20; exit 1; }

# Une métrique de node_exporter sur le volume monté, une de l'API.
oncurl 'http://10.89.0.10:8428/api/v1/query?query=node_filesystem_size_bytes%7Bmountpoint%3D%22%2Fhost%2Fdata%22%7D' | grep -q '"result":\[{'
oncurl 'http://10.89.0.10:8428/api/v1/query?query=presidente_rss_bytes' | grep -q '"result":\[{'

echo '== Alertes'
# Journal de vmalert (pour le diagnostic : les cibles absentes ici, comme Litestream, y apparaissent).
docker logs presidente-vmalert 2>&1 | grep -iE "cannot|error" || true
# Sans jeton : refusé ; avec : reçu (aucun administrateur ici, d'où le journal).
code=$(docker run --rm --network "$NET" "$CURL" -s -o /dev/null -w '%{http_code}' -X POST \
  http://presidente-api:9464/api/v2/alerts -d '[]')
[ "$code" = 401 ] || { echo "sans jeton : $code"; exit 1; }
oncurl -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '[{"labels":{"alertname":"Essai"},"annotations":{"summary":"essai"},"endsAt":"2100-01-01T00:00:00Z"}]' \
  http://presidente-api:9464/api/v2/alerts
sleep 1
docker logs presidente-api 2>&1 | grep -q 'alertes sans destinataire'

echo 'Surveillance OK'
