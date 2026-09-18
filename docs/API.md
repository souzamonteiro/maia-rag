# HTTP API Reference

Base URL: `/api`

The Maia RAG API is designed to be lightweight, stateless, and consumed by external clients such as Maia Chat, Maia Studio, MaiaScript CLI tools, and web dashboards.

---

## Service & Diagnostics

### `GET /health`
Returns overall health status and individual component liveness for Ollama, Qdrant, and SQLite.

**Response `200 OK` / `503 Service Unavailable`:**
```json
{
  "ok": true,
  "service": "maia-rag",
  "version": "0.1.0",
  "timestamp": "2026-09-17T23:00:00.000Z",
  "components": {
    "ollama": { "status": "OK", "baseUrl": "http://127.0.0.1:11434" },
    "qdrant": { "status": "OK", "url": "http://127.0.0.1:6333", "vectorsCount": 142 },
    "sqlite": { "status": "OK" }
  }
}
```

### `GET /stats`
Returns aggregate statistics of indexed documents, chunks, collections, and storage consumption.

**Response `200 OK`:**
```json
{
  "documents": 15,
  "ready": 15,
  "failed": 0,
  "processing": 0,
  "chunks": 142,
  "collections": 3,
  "totalSizeBytes": 3847291,
  "qdrant": {
    "status": "green",
    "vectorsCount": 142,
    "pointsCount": 142
  }
}
```

### `GET /health/summary`
Returns operational health metrics, low-confidence classification warnings, and recent processing error logs.

### `GET /models`
Lists models currently pulled and available in the local Ollama instance, alongside currently configured models.

---

## Documents Management

### `GET /documents`
Retrieves a paginated list of ingested documents.

**Query Parameters:**
- `limit` (integer, default `100`, max `500`): Maximum items to return.
- `offset` (integer, default `0`): Pagination offset.
- `status` (string, optional): Filter by `ready`, `processing`, or `failed`.
- `collectionId` (string, optional): Filter documents belonging to a collection.
- `search` (string, optional): Search by filename or AI metadata keywords.

### `GET /documents/:id`
Retrieves detailed metadata, technical info, assigned collections, and raw chunk payloads for a single document.

### `POST /documents`
Ingests a new document into the knowledge base.

**Request:** `multipart/form-data`
- `file` (binary, required): The document file (PDF, DOCX, Markdown, Text, Code).
- `collectionId` (string, optional): Target collection ID.
- `aiClassification` (boolean, optional, default `true`): Enable AI enrichment.

**Response `201 Created`:**
```json
{
  "duplicate": false,
  "documentId": "c8f20b41-...",
  "filename": "language-spec.md",
  "chunks": 12,
  "aiMetadata": {
    "documentType": "Technical Documentation",
    "language": "en",
    "domains": [{ "name": "compiler-design", "confidence": 0.95 }]
  }
}
```

### `DELETE /documents/:id`
Permanently deletes the document record from SQLite, deletes its original copy on disk, and removes all its vector points from Qdrant.

### `POST /documents/:id/reprocess`
Idempotently re-extracts, re-chunks, and re-embeds an existing document using its original file stored on disk.

### `GET /documents/:id/original`
Streams the stored original document file for download.

---

## Collections Management

### `GET /collections`
Lists all knowledge collections along with their associated document counts.

### `POST /collections`
Creates a new thematic collection.

**Request `application/json`:**
```json
{
  "name": "ai-papers",
  "description": "Research papers and publications"
}
```

### `GET /collections/:id`
Retrieves collection details and its member documents.

### `DELETE /collections/:id`
Deletes a collection. Documents associated with the collection remain intact in the knowledge base.

### `POST /documents/:id/collections`
Associates an indexed document with a collection.

**Request `application/json`:**
```json
{
  "collectionId": "uuid"
}
```

### `DELETE /documents/:id/collections/:collectionId`
Removes the association between a document and a collection.

---

## Retrieval & Generation

### `POST /search`
Performs pure semantic vector retrieval without calling the chat generation LLM. Useful for direct excerpt retrieval and search interfaces.

**Request `application/json`:**
```json
{
  "query": "How to configure WireGuard VPN",
  "options": {
    "topK": 5,
    "collectionId": "uuid"
  }
}
```

**Response `200 OK`:**
```json
{
  "query": "How to configure WireGuard VPN",
  "count": 1,
  "results": [
    {
      "index": 1,
      "score": 0.8124,
      "filename": "networking.md",
      "startLine": 12,
      "endLine": 45,
      "documentId": "...",
      "text": "..."
    }
  ]
}
```

### `POST /query`
Performs complete Retrieval-Augmented Generation. Retrieves relevant chunks, formats untrusted source context, calls Ollama, and returns a verified answer with bracket citations `[1]`, `[2]`.

**Request `application/json`:**
```json
{
  "question": "What are the supported file formats in Maia RAG?",
  "options": {
    "topK": 6,
    "model": "qwen2.5:3b",
    "collectionId": "uuid"
  }
}
```

**Response `200 OK`:**
```json
{
  "question": "What are the supported file formats in Maia RAG?",
  "answer": "Maia RAG supports PDF, DOCX, Markdown, plain text, and common source code files. [1]",
  "model": "qwen2.5:3b",
  "sources": [
    {
      "index": 1,
      "score": 0.7682,
      "filename": "README.md",
      "chunkIndex": 0,
      "documentId": "...",
      "text": "..."
    }
  ]
}
```
