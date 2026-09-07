# Deployment Guide

## Development workstation

Components:

- Node.js service on `127.0.0.1:4310`
- Ollama on `127.0.0.1:11434`
- Qdrant on `127.0.0.1:6333`
- SQLite and originals under `./data`

```bash
cp .env.example .env
npm install
docker compose up -d
ollama pull qwen3-embedding:0.6b
ollama pull qwen2.5:3b
npm start
```

In another terminal:

```bash
npm run watch
```

## Maia Edge / production node

Recommended filesystem:

```text
/opt/maia-rag/                 application checkout
/srv/maia/rag/                 persistent data (alternative to /opt data)
/etc/maia-rag.env              environment overrides
```

Recommended network policy:

- Maia RAG API should bind to loopback or the WireGuard interface, not the public Internet.
- Qdrant should bind to loopback/private network only.
- Ollama should remain private.
- Nginx on Maia Edge may expose only the Web/API routes required by authenticated clients.

Example environment file:

```bash
MAIA_RAG_HOST=127.0.0.1
MAIA_RAG_PORT=4310
MAIA_RAG_DATA_DIR=/srv/maia/rag
OLLAMA_BASE_URL=http://127.0.0.1:11434
QDRANT_URL=http://127.0.0.1:6333
```

### systemd

Copy the units from `systemd/`, adapt user/path, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now maia-rag.service
sudo systemctl enable --now maia-rag-watcher.service
```

### Reverse proxy concept

```nginx
location /rag/ {
    proxy_pass http://127.0.0.1:4310/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 200m;
}
```

Add authentication before exposing ingestion or administration routes.

## Capacity planning

The dominant storage cost is original files plus vectors. Actual vector storage depends on vector dimension, precision, replicas and payload. Track corpus growth rather than hard-coding assumptions. Web UI should eventually expose original bytes, chunk count, vector count and estimated index size.

## Backup

Back up together:

1. Original file store.
2. SQLite/PostgreSQL metadata.
3. Configuration and classification/index version metadata.

Qdrant may be backed up using its snapshot facilities, but the vector index should also be reproducible from originals + metadata + processing versions.
