# Image de Litestream : binaire statique de l'image officielle, sur distroless/static,
# utilisateur non root (même uid que l'API, propriétaire de /data/db), configuration intégrée.
#   docker build -f infra/images/litestream.Dockerfile -t ghcr.io/mchegdali/el-presidente-litestream infra/images
#
# Deux usages de la même image :
#   replicate                                                   (service permanent)
#   restore -if-db-not-exists -if-replica-exists /data/db/presidente.db   (avant l'API)

FROM litestream/litestream:0.5.17@sha256:4b02b9859a6b6b4087d8b8944e15f7e984bd7957cba322bbeee38b0e27b9656a AS litestream

FROM gcr.io/distroless/static-debian13:nonroot@sha256:25ac8f0c3b2334a9eb05452266bd4697864a8c8ef0ef71e5e6480d7f92868329
# Relie le paquet GHCR au dépôt (droits de la CI sur les versions suivantes).
LABEL org.opencontainers.image.source="https://github.com/mchegdali/el-presidente"
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
USER 65532:10000
ENTRYPOINT ["/usr/local/bin/litestream"]
CMD ["replicate"]
