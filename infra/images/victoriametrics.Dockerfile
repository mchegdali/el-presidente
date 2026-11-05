# VictoriaMetrics (une seule instance) avec sa configuration de collecte. Image « scratch »
# de l'éditeur, utilisateur non root. Le dossier /storage, à ce propriétaire, initialise le
# volume Docker nommé où vivent les données (30 jours).
#   docker build -f infra/images/victoriametrics.Dockerfile infra/images

FROM victoriametrics/victoria-metrics:v1.155.0-scratch@sha256:3aeed180cfaed670ad88e24e3de2416991ec4a971b8b49e2e0476b87d21222e6
LABEL org.opencontainers.image.source="https://github.com/mchegdali/el-presidente"
COPY monitoring/scrape.yml /etc/victoriametrics/scrape.yml
COPY --chown=65534:65534 monitoring/storage /storage
USER 65534:65534
ENTRYPOINT ["/victoria-metrics-prod", \
  "-storageDataPath=/storage", \
  "-retentionPeriod=30d", \
  "-httpListenAddr=:8428", \
  "-promscrape.config=/etc/victoriametrics/scrape.yml", \
  "-promscrape.config.strictParse=true"]
