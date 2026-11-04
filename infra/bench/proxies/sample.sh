#!/bin/bash
# Échantillonneur du serveur testé, une ligne JSON par seconde :
#   t (epoch ms), cpu (compteurs /proc/stat : total, idle, steal, en ticks),
#   et pour chaque conteneur : CPU cumulé (µs, cgroup) et mémoire (octets).
#   ./sample.sh bench-api-1 bench-haproxy-1 bench-pg-1 > /tmp/samples.jsonl
set -euo pipefail
declare -A CG
for name in "$@"; do
  id=$(docker inspect -f '{{.Id}}' "$name")
  CG[$name]=$(ls -d /sys/fs/cgroup/system.slice/docker-"$id".scope 2>/dev/null || ls -d /sys/fs/cgroup/docker/"$id")
done
while true; do
  read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
  total=$((user + nice + system + idle + iowait + irq + softirq + steal))
  # %s%N ÷ 10⁶ plutôt que %3N : le `date` d'Ubuntu 26.04 (uutils) ignore la largeur de %N.
  line="{\"t\":$(($(date +%s%N) / 1000000)),\"cpu\":{\"total\":$total,\"idle\":$((idle + iowait)),\"steal\":$steal}"
  for name in "$@"; do
    usec=$(awk '/^usage_usec/ {print $2}' "${CG[$name]}/cpu.stat")
    mem=$(cat "${CG[$name]}/memory.current")
    line+=",\"$name\":{\"usec\":$usec,\"mem\":$mem}"
  done
  echo "$line}"
  sleep 1
done
