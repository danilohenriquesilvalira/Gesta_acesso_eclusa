# ── Stage 1: chef prepare (gera recipe das dependências) ─────────────────────
FROM rust:latest AS chef
RUN cargo install cargo-chef --locked
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 2: compila APENAS dependências (fica em cache) ─────────────────────
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# ── Stage 3: compila só o teu código (30-60s nas builds seguintes) ────────────
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --bin wincc-api

# ── Stage 4: imagem final mínima ──────────────────────────────────────────────
FROM ubuntu:24.04
RUN apt-get update && \
    apt-get install -y libssl3 ca-certificates openssh-client && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/wincc-api /usr/local/bin/wincc-api
EXPOSE 8080
CMD ["wincc-api"]
