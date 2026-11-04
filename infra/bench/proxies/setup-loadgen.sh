#!/bin/bash
# Banc des proxys — préparation du générateur de charge. Jetable avec le serveur.
#   ./setup-loadgen.sh   (root, depuis infra/bench/proxies)
set -euo pipefail
cd "$(dirname "$0")"

apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -yq unzip

# Beaucoup de connexions sortantes vers une seule adresse : ports éphémères et descripteurs.
cat > /etc/sysctl.d/99-loadgen.conf <<'SYS'
net.ipv4.ip_local_port_range = 10240 65535
net.ipv4.tcp_tw_reuse = 1
net.core.somaxconn = 4096
fs.file-max = 1048576
SYS
sysctl --system >/dev/null
cat > /etc/security/limits.d/99-loadgen.conf <<'LIM'
* soft nofile 131072
* hard nofile 131072
LIM

# Même version que l'image de l'API (infra/api.Dockerfile).
BUN_VERSION=$(sed -n 's/^FROM oven\/bun:\([0-9.]*\).*/\1/p' ../../api.Dockerfile)
# Serveur IPv6 seulement : github.com (installateur officiel) est injoignable, le registre
# npm l'est ; le binaire officiel y est publié sous @oven/bun-linux-x64.
if ! [ -x /root/.bun/bin/bun ] || [ "$(/root/.bun/bin/bun --version)" != "$BUN_VERSION" ]; then
  install -d /root/.bun/bin
  TMP=$(mktemp -d)
  curl -fsSL "https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-$BUN_VERSION.tgz" | tar -xz -C "$TMP"
  install -m 755 "$TMP/package/bin/bun" /root/.bun/bin/bun
  rm -rf "$TMP"
fi
cd ../../..
/root/.bun/bin/bun install --frozen-lockfile
echo "Générateur prêt : bun $(/root/.bun/bin/bun --version)"
