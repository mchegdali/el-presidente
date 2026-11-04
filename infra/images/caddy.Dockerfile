# Image de Caddy : binaire statique de l'image officielle, sur distroless/static (ni shell ni
# gestionnaire de paquets), utilisateur non root, configuration intégrée.
#   docker build -f infra/images/caddy.Dockerfile -t ghcr.io/mchegdali/el-presidente-caddy infra/images
#
# Ports 80/443 sans privilège : sysctl net.ipv4.ip_unprivileged_port_start=80 sur l'hôte
# (réseau de l'hôte), aucune capacité nécessaire.

FROM caddy:2.11.7@sha256:36c24ad91a7ff7bc4c87fe22bfa8df3c4b18da0773d73fc12ee2c52b98c0bb7e AS caddy
# L'image officielle pose cap_net_bind_service sur le binaire. Avec no-new-privileges et
# aucune capacité, le noyau refuse alors l'exécution (« operation not permitted ») : retirée.
RUN setcap -r /usr/bin/caddy

FROM gcr.io/distroless/static-debian13:nonroot@sha256:25ac8f0c3b2334a9eb05452266bd4697864a8c8ef0ef71e5e6480d7f92868329
# Relie le paquet GHCR au dépôt (droits de la CI sur les versions suivantes).
LABEL org.opencontainers.image.source="https://github.com/mchegdali/el-presidente"
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
# Certificats et état ACME sur le volume (/data/caddy monté sur /data) : conservés quand le
# serveur est remplacé. /config : tmpfs (rien n'y est persisté, `persist_config off`).
ENV XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config
USER 65533:10000
ENTRYPOINT ["/usr/bin/caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
