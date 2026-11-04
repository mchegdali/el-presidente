# Proxy Pingora du banc. Construction : Rust 1.99.0 (1.99.1 trop récente, règle des 7 jours).
FROM rust:1.99.0-trixie@sha256:81015672d6939b0265f09adf96d5de125482bb1330106076956b0518e74edc90 AS build
RUN apt-get update -q && apt-get install -yq --no-install-recommends cmake clang libssl-dev pkg-config
WORKDIR /src
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:trixie-slim@sha256:f6b08b09a05725f9431502d3b5714f5c4576e82c1a84fa1debe0c24a7e0c3ec4
RUN apt-get update -q && apt-get install -yq --no-install-recommends libssl3t64 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/bench-pingora /usr/local/bin/bench-pingora
COPY pingora.yaml /etc/pingora.yaml
ENTRYPOINT ["/usr/local/bin/bench-pingora", "-c", "/etc/pingora.yaml"]
