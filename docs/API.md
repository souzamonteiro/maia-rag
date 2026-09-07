# HTTP API

Base URL: `/api`

## `GET /health`

Service liveness.

## `GET /stats`

Basic document/chunk counts.

## `GET /documents`

Current MVP returns up to 500 recent documents. Add pagination/filtering before large deployments.

## `POST /documents`

Multipart field: `file`.

Future request metadata should allow optional manual overrides and collection hints while leaving all fields optional.

## `POST /query`

```json
{
  "question": "How does MaiaScript declare a class?",
  "options": {
    "topK": 8,
    "model": "qwen2.5:7b"
  }
}
```

Response:

```json
{
  "answer": "... [1]",
  "sources": [
    {
      "index": 1,
      "filename": "language-reference.md",
      "documentId": "...",
      "chunkIndex": 4,
      "score": 0.84,
      "text": "..."
    }
  ]
}
```

## Planned API surface

- collections CRUD
- document metadata read/update
- delete/reprocess/reembed
- jobs/events/progress
- search-only endpoint
- hybrid retrieval controls
- authentication and ACLs
