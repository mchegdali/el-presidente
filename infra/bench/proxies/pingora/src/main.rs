// Proxy minimal sur Pingora, mêmes règles que les autres proxys du banc :
// TLS 1.3 (OpenSSL, comme HAProxy et nginx), HTTP/1.1 + HTTP/2, WebSocket (upgrade géré
// par Pingora), API par socket Unix, X-Real-IP, /metrics bloqué, pas de journal d'accès.
// Nombre de threads : fichier de configuration (`-c pingora.yaml`, threads: 2).

use async_trait::async_trait;
use pingora::http::RequestHeader;
use pingora::listeners::tls::TlsSettings;
use pingora::prelude::*;
use pingora::proxy::{ProxyHttp, Session, http_proxy_service};
use pingora::tls::ssl::{SslOptions, SslVersion};
use pingora::upstreams::peer::HttpPeer;

const SOCKET: &str = "/run/presidente/api.sock";

struct Api;

#[async_trait]
impl ProxyHttp for Api {
    type CTX = ();

    fn new_ctx(&self) -> Self::CTX {}

    async fn request_filter(&self, session: &mut Session, _ctx: &mut Self::CTX) -> Result<bool> {
        if session.req_header().uri.path() == "/metrics" {
            session.respond_error(404).await?;
            return Ok(true);
        }
        Ok(false)
    }

    async fn upstream_peer(&self, _session: &mut Session, _ctx: &mut Self::CTX) -> Result<Box<HttpPeer>> {
        Ok(Box::new(HttpPeer::new_uds(SOCKET, false, String::new())?))
    }

    async fn upstream_request_filter(
        &self,
        session: &mut Session,
        upstream: &mut RequestHeader,
        _ctx: &mut Self::CTX,
    ) -> Result<()> {
        if let Some(addr) = session.client_addr().and_then(|a| a.as_inet()) {
            upstream.insert_header("X-Real-IP", addr.ip().to_string())?;
        }
        upstream.remove_header("X-Forwarded-For");
        Ok(())
    }
}

fn main() {
    let mut server = Server::new(Some(Opt::parse_args())).expect("serveur Pingora");
    server.bootstrap();

    let mut tls = TlsSettings::intermediate("/certs/bench.crt", "/certs/bench.key").expect("certificat");
    tls.set_min_proto_version(Some(SslVersion::TLS1_3)).expect("TLS 1.3");
    // Alignés sur les autres proxys : X25519 puis P-256 (OpenSSL 3.5 proposerait d'abord
    // X25519MLKEM768), même ordre de suites TLS 1.3.
    tls.set_groups_list("X25519:P-256").expect("groupes");
    tls.set_ciphersuites("TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256")
        .expect("suites");
    // Ordre du serveur (comme HAProxy) : sinon OpenSSL suit le client (AES-256 en tête).
    tls.set_options(SslOptions::CIPHER_SERVER_PREFERENCE);
    tls.enable_h2();

    let mut proxy = http_proxy_service(&server.configuration, Api);
    proxy.add_tls_with_settings("0.0.0.0:443", None, tls);
    server.add_service(proxy);
    server.run_forever();
}
