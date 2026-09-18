# Maia RAG

**Maia RAG** is a local-first, autonomous Retrieval-Augmented Generation knowledge service for the Maia Platform. Humans can simply drop files into a Web UI, CLI or watched inbox. Maia RAG extracts content, enriches metadata with a local LLM, chunks by document type, creates embeddings through Ollama and indexes the result in Qdrant.

It is intentionally independent from Maia Chat. Maia Chat, Maia Studio, MaiaScript tooling and future Maia models can all consume the same knowledge API.

## Features

- **Interactive Web UI**: Modern dark-theme dashboard for natural language queries (RAG), multi-file drag-and-drop ingestion, document management, collections, and health monitoring.
- **Comprehensive CLI**: `add`, `query`, `search`, `status`, `documents`, `delete`, `reprocess`, `collections`, and `doctor`.
- **Autonomous Watch Service**: Monitors `data/inbox` for unattended background ingestion.
- **Document-Aware Extraction**: PDF, DOCX, Markdown, Text, CSV, TSV, JSON, YAML, SQL, and source code (`.js`, `.ts`, `.py`, `.c`, `.cpp`, `.java`, `.go`, `.rs`, `.maia`, etc.).
- **Non-Blocking AI Classification**: Automatic metadata enrichment (type, domains, keywords, summary) via Ollama with graceful fallback.
- **Duplicate Prevention**: SHA-256 content hashing prevents redundant storage and indexing.
- **Robust Storage**: Qdrant vector index for cosine similarity + SQLite WAL database for transactional document metadata and jobs tracking.
- **Traceable Citations**: Answers cite exact source chunks (`[1]`, `[2]`) with line numbers, file paths, and confidence scores.
- **Zero Cloud Lock-in**: Fully functional on-premises with local Ollama and Qdrant instances.

## Architecture

```text
Web UI ─────────┐
CLI ────────────┼──> Ingestion Pipeline ──> Extract ──> AI Metadata ──> Chunk ──> Embed ──> Qdrant
Inbox Watcher ──┘                                │                                         │
                                                 └─────────> SQLite Metadata <─────────────┘

Maia Chat ───> Query API ───> Embed Query ───> Vector Search ───> Context Builder ───> Ollama Chat
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the detailed design specification.

## Quick Start (Development)

Requirements: Node.js 20+, Ollama. (Qdrant runs either via standalone binary or Docker).

```bash
git clone https://github.com/souzamonteiro/maia-rag.git
cd maia-rag
cp .env.example .env
./scripts/bootstrap.sh
npm run start:services
npm start
```

Open `http://127.0.0.1:4310` in your web browser.

### Run the Background Watcher

```bash
npm run watch
```
Any file placed into `data/inbox/` will be automatically processed and indexed.

### CLI Usage

```bash
# Ingest single file or directory
node src/cli/index.js add ./README.md
node src/cli/index.js add ./docs --recursive

# Ask a question (RAG with citations)
node src/cli/index.js query "What are the MVP capabilities of Maia RAG?"

# Semantic vector search (without LLM generation)
node src/cli/index.js search "Ollama embedding models"

# View system status and document table
node src/cli/index.js status
node src/cli/index.js documents

# Manage collections
node src/cli/index.js collections list
node src/cli/index.js collections create "research-papers"

# Run system diagnostic
node src/cli/index.js doctor
```

## Production Deployment (/srv/maia/maia-rag)

For production deployment on Maia Edge nodes, Maia RAG installs into `/srv/maia/maia-rag` with dedicated systemd services running under the `maia` system user:

```bash
sudo ./scripts/install.sh
```

### Managed Services:
- `maia-qdrant.service` — Native standalone Qdrant vector database daemon (`127.0.0.1:6333`).
- `maia-rag.service` — Maia RAG API and Web server (`127.0.0.1:4310`).
- `maia-rag-watcher.service` — Autonomous inbox watcher service.

### Management Commands:
```bash
sudo systemctl status maia-qdrant maia-rag maia-rag-watcher
sudo journalctl -u maia-rag -f
sudo systemctl restart maia-rag
```

## HTTP API

Base URL: `/api`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service and component status (Ollama, Qdrant, SQLite) |
| `GET` | `/stats` | Document counts, chunks, collections, and disk usage |
| `GET` | `/health/summary` | Error logs and low-confidence classification signals |
| `GET` | `/models` | Available Ollama models |
| `GET` | `/documents` | List indexed documents (with pagination, filters) |
| `GET` | `/documents/:id` | Get document details, metadata, and chunk payloads |
| `POST` | `/documents` | Ingest document (multipart form `file`, optional `collectionId`) |
| `DELETE` | `/documents/:id` | Permanently delete document, files, and Qdrant vectors |
| `POST` | `/documents/:id/reprocess` | Re-extract, re-chunk, and re-embed document |
| `GET` | `/documents/:id/original` | Download stored original file |
| `GET` | `/collections` | List knowledge collections |
| `POST` | `/collections` | Create new collection |
| `DELETE` | `/collections/:id` | Delete collection |
| `POST` | `/documents/:id/collections` | Assign document to collection |
| `POST` | `/search` | Semantic vector search (chunks and scores only) |
| `POST` | `/query` | Full RAG generation (synthesized answer + citations) |

### Query Example (`POST /api/query`)

```json
{
  "question": "How does MaiaScript declare a class?",
  "options": {
    "topK": 6,
    "model": "qwen2.5:3b"
  }
}
```

Response:
```json
{
  "question": "How does MaiaScript declare a class?",
  "answer": "MaiaScript declares a class using the `class` keyword... [1]",
  "model": "qwen2.5:3b",
  "sources": [
    {
      "index": 1,
      "score": 0.8412,
      "filename": "language-reference.md",
      "startLine": 45,
      "endLine": 80,
      "documentId": "4c9d8a1e-...",
      "text": "..."
    }
  ]
}
```

## Testing

Run the automated test suite:

```bash
npm test
```

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## Gradual dataset and book imports

A sequential HTTP importer supports local PDF/Markdown/text files, direct
file URLs and inline articles in JSONL manifests. It persists a separate queue,
resumes interrupted work and disables per-document AI classification. Start with
`npm run import -- enqueue docs/examples/import.jsonl --dry-run`.
See [docs/IMPORTER.md](docs/IMPORTER.md) for batching, provenance, retry behavior
and limitations. Dataset-specific Hugging Face adapters are not included yet.

## Remote curator access

For `rag.maiaplatform.org`, Nginx templates provide HTTPS and individual Basic
Auth credentials at the Maia Edge VPS, with a WireGuard-only proxy to the local
RAG service. See [docs/REMOTE-ACCESS.md](docs/REMOTE-ACCESS.md) for rendering,
certificate bootstrap, user management and verification. All authenticated
curators have full administrative access. No application authentication is
enabled automatically by installing Maia RAG.
