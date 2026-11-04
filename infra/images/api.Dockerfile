# Image de l'API : un binaire compilé par Bun dans une image distroless (ni shell ni
# gestionnaire de paquets), utilisateur non root. Les migrations sont appliquées par l'API
# à l'ouverture de la base.
#   docker build -f infra/images/api.Dockerfile -t ghcr.io/mchegdali/el-presidente-api .

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /src
COPY package.json bun.lock bunfig.toml ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json
# CA supplémentaire facultatif (proxy d'entreprise) : --secret id=ca,src=chemin/ca.pem
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    bun install --frozen-lockfile --production --filter '@el-presidente/api'
RUN cd apps/api && bun run build

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:08476c244888bfb425bae1ae4dd7c17f093e972aab8426883d97f3c6f280f7c1
WORKDIR /app
COPY --from=build /src/apps/api/dist/presidente-api ./
COPY --from=build /src/packages/db/drizzle ./drizzle
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/drizzle \
    DATABASE_PATH=/data/db/presidente.db \
    LISTEN_UNIX=/run/presidente/api.sock \
    TRUST_PROXY=true
# 65532 : propriétaire de /data/db ; groupe 10000 partagé avec Caddy (socket de l'API).
USER 65532:10000
ENTRYPOINT ["/app/presidente-api"]
