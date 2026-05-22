# ── Stage 1: compilação ──────────────────────────────────────────────────────
FROM rust:latest AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release --bin wincc-api

# ── Stage 2: imagem de execução (Ubuntu 24.04 = GLIBC 2.39) ─────────────────
FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y libssl3 ca-certificates openssh-client && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/wincc-api /usr/local/bin/wincc-api

EXPOSE 8080

CMD ["wincc-api"]
