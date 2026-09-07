# Maia RAG

**Maia RAG** is a local-first, autonomous Retrieval-Augmented Generation knowledge service for the Maia Platform. Humans can simply drop files into a Web UI, CLI or watched inbox. Maia RAG extracts content, enriches metadata with a local LLM, chunks by document type, creates embeddings through Ollama and indexes the result in Qdrant.

It is intentionally independent from Maia Chat. Maia Chat, Maia Studio, MaiaScript tooling and future Maia models can all consume the same knowledge API.

## MVP capabilities

- Web UI with drag-and-drop ingestion, document list and basic statistics.
- CLI: `add`, `status`, `documents`, `doctor`.
- Watch service for unattended ingestion from `data/inbox`.
- PDF, DOCX, Markdown, text and common source-code extraction.
- AI-generated classification and metadata using Ollama.
- Content hashing and duplicate prevention.
- Qdrant vector index plus SQLite administrative metadata.
- RAG query API returning answer and source chunks.
- Local-first deployment; no cloud dependency is required.

## Architecture

```text
Web UI ─┐
CLI ────┼──> Ingestion API/Pipeline ─> Extract ─> AI Metadata ─> Chunk ─> Embed ─> Qdrant
Watcher ┘                                  │                              │
                                           └────────> SQLite metadata <───┘

Maia Chat ─> Query API ─> Embed query ─> Retrieve ─> Context Builder ─> Ollama Chat
```

See `docs/ARCHITECTURE.md` for the full design.

## Quick start

Requirements: Node.js 20+, Ollama, Docker/Podman.

```bash
git clone https://github.com/YOUR-USER/maia-rag.git
cd maia-rag
cp .env.example .env
./scripts/bootstrap.sh
npm start
```

Open `http://127.0.0.1:4310`.

Run the watcher separately:

```bash
npm run watch
```

Or ingest directly:

```bash
npm link
maia-rag add ./papers --recursive
maia-rag doctor
```

## API

```http
GET  /api/health
GET  /api/stats
GET  /api/documents
POST /api/documents   multipart/form-data: file
POST /api/query       { "question": "...", "options": {} }
```

## Status

This repository is a construction-ready architectural baseline and MVP scaffold. The roadmap intentionally separates a small first release from advanced features such as Tree-sitter AST chunking, hybrid retrieval, reranking, OCR, access control and distributed workers.

## License

Choose and add the project license before public release. Apache-2.0 is a strong default for an infrastructure project intended for broad reuse.
