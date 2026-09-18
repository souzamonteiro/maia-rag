# Deployment Guide

This guide covers deployment of **Maia RAG** for local development and for production on Maia Edge / Linux host environments.

---

## 1. Development Workstation

### Prerequisites
- Node.js 20+
- Ollama running locally on `http://127.0.0.1:11434`
- Either Docker (for Qdrant container) or the standalone Qdrant binary

### Setup & Run
```bash
git clone https://github.com/souzamonteiro/maia-rag.git
cd maia-rag
cp .env.example .env

# Bootstrap dependencies, Qdrant, and Ollama models
./scripts/bootstrap.sh

# Start services (starts Qdrant in background if not already running)
npm run start:services

# Start Maia RAG server
npm start
```

Open `http://127.0.0.1:4310` to view the Web UI dashboard.

To run the background inbox watcher in development:
```bash
npm run watch
```

---

## 2. Production Deployment (`/srv/maia/maia-rag`)

In the Maia Platform architecture, system services are hosted in `/srv/maia/[PROJECT]` and managed by systemd under the `maia` system user.

### Automated Installation
Run the installer as root:

```bash
cd /home/roberto/projects/maia-rag
sudo ./scripts/install.sh
```

### What `scripts/install.sh` Does:
1. Installs build and runtime tools (`rsync`, `curl`, `build-essential`, `python3`).
2. Ensures the dedicated `maia` system user and group exist.
3. Provisions `/srv/maia/maia-rag` with strict permissions (`0750`, owned by `root:maia`).
4. Creates data directories `/srv/maia/maia-rag/data/{inbox,processing,processed,failed,originals,qdrant}` owned by `maia:maia`.
5. Syncs project codebase excluding development files (`.git`, `node_modules`, `test`).
6. Installs the standalone Qdrant vector database binary in `/srv/maia/maia-rag/bin/qdrant`.
7. Installs production Node.js dependencies (`npm install --omit=dev`) and builds native `better-sqlite3`.
8. Generates `/srv/maia/maia-rag/.env` with production paths.
9. Pulls required models (`qwen3-embedding:0.6b` and `qwen2.5:3b`) in Ollama.
10. Installs, enables, and starts three systemd services:
    - `maia-qdrant.service`
    - `maia-rag.service`
    - `maia-rag-watcher.service`

### Production Directory Layout
```text
/srv/maia/maia-rag/
├── .env                  # Environment configuration
├── bin/
│   └── qdrant            # Standalone Qdrant binary
├── config/
│   └── default.yaml      # Service configuration
├── data/
│   ├── inbox/            # Watched ingestion inbox
│   ├── originals/        # Immutable original document copies
│   ├── processing/       # Temporary ingestion working directory
│   ├── processed/        # Ingestion archive
│   ├── failed/           # Ingestion error quarantine & sidecar JSONs
│   ├── qdrant/           # Vector index storage
│   └── metadata.sqlite   # SQLite operational metadata database
├── src/                  # Application source code
└── deploy/systemd/       # Systemd unit files
```

---

## 3. Systemd Services Management

Check service status:
```bash
sudo systemctl status maia-qdrant.service maia-rag.service maia-rag-watcher.service
```

Restart services:
```bash
sudo systemctl restart maia-rag
```

Tail live logs:
```bash
sudo journalctl -u maia-rag -f
sudo journalctl -u maia-rag-watcher -f
sudo journalctl -u maia-qdrant -f
```

---

## 4. Reverse Proxy Integration (Nginx)

When exposing Maia RAG to trusted internal clients (e.g., via WireGuard `wg0`), proxy requests through Nginx:

```nginx
location /rag/ {
    proxy_pass http://127.0.0.1:4310/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 100m;
}
```

---

## 5. Backup & Recovery

To create a complete backup of the Maia RAG state, archive together:
1. SQLite metadata: `/srv/maia/maia-rag/data/metadata.sqlite`
2. Originals store: `/srv/maia/maia-rag/data/originals/`
3. Qdrant vector storage: `/srv/maia/maia-rag/data/qdrant/`
4. Configuration: `/srv/maia/maia-rag/.env` and `config/default.yaml`

Even if Qdrant vector data is lost, the entire vector database can be reconstructed deterministically by running reprocess on all documents from the original files and SQLite records.
