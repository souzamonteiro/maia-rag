# Data Model

## Document

```json
{
  "id": "uuid",
  "sha256": "...",
  "filename": "paper.pdf",
  "mimeType": "application/pdf",
  "size": 1928271,
  "status": "ready",
  "chunkCount": 84,
  "embeddingModel": "qwen3-embedding:0.6b",
  "createdAt": "...",
  "updatedAt": "..."
}
```

## Metadata provenance target

```json
{
  "title": {"value":"...","source":"extracted","confidence":1.0},
  "domain": {"value":"computational-modeling","source":"ai","confidence":0.93,"model":"qwen2.5:3b"},
  "project": {"value":"maia-rag","source":"manual","confidence":1.0}
}
```

Precedence: manual > reliable extracted metadata > AI inference. Keep all observations in history even when one value is selected as canonical.

## Chunk payload

```json
{
  "documentId": "uuid",
  "chunkIndex": 12,
  "text": "...",
  "filename": "parser.cpp",
  "startLine": 84,
  "endLine": 126,
  "documentType": "source-code",
  "language": "en",
  "domains": [{"name":"software-engineering","confidence":0.91}],
  "keywords": ["parser","AST"],
  "project": "maiascript"
}
```
