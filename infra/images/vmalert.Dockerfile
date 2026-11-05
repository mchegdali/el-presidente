# vmalert avec ses règles. Jeton de l'API (destinataire des alertes) par l'environnement :
# -envflag.enable lit notifier_bearerToken. Image « scratch » de l'éditeur, non root.
#   docker build -f infra/images/vmalert.Dockerfile infra/images

FROM victoriametrics/vmalert:v1.155.0-scratch@sha256:31b24fda54dbb23e75723e585b13a0d1bd36fa293fd324c9d9e98696ee47874d
LABEL org.opencontainers.image.source="https://github.com/mchegdali/el-presidente"
COPY monitoring/rules.yml /etc/vmalert/rules.yml
USER 65534:65534
ENTRYPOINT ["/vmalert-prod", \
  "-envflag.enable", \
  "-rule=/etc/vmalert/rules.yml", \
  "-datasource.url=http://presidente-victoriametrics:8428", \
  "-remoteWrite.url=http://presidente-victoriametrics:8428", \
  "-remoteRead.url=http://presidente-victoriametrics:8428", \
  "-notifier.url=http://presidente-api:9464", \
  "-evaluationInterval=1m", \
  "-httpListenAddr=:8880"]
