# Image de l'API : un binaire compilé par Bun (API, et `migrate` pour les migrations) dans
# une image distroless (ni shell ni gestionnaire de paquets), utilisateur non root.
#   docker build -f infra/api.Dockerfile -t ghcr.io/mchegdali/el-presidente-api .

FROM oven/bun:1.4.2 AS build
WORKDIR /src
COPY package.json bun.lock ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json
# CA supplémentaire facultatif (proxy d'entreprise) : --secret id=ca,src=chemin/ca.pem
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    bun install --frozen-lockfile --production --filter '@el-presidente/api'
RUN cd apps/api && bun run build

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=build /src/apps/api/dist/presidente-api ./
COPY --from=build /src/packages/db/drizzle ./drizzle
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/drizzle \
    LISTEN_UNIX=/run/presidente/api.sock
USER nonroot
ENTRYPOINT ["/app/presidente-api"]
