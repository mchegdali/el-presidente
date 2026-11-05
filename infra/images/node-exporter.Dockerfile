# node_exporter (image distroless de l'éditeur), republiée sur GHCR comme les autres images
# du serveur : même épinglage par empreinte, même suivi par Renovate. Collecteurs choisis au
# lancement (infra/src/app.ts) : disque du volume /data, mémoire, processeur, charge.
#   docker build -f infra/images/node-exporter.Dockerfile infra/images

FROM prom/node-exporter:v1.12.1-distroless@sha256:8c9bac11973b94b59be88d6e11fee4429aa743c8846cdc75d65b18db33f6a106
LABEL org.opencontainers.image.source="https://github.com/mchegdali/el-presidente"
USER 65534:65534
