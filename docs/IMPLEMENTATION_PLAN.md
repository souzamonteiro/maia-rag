# Implementation Plan

## Milestone 0 — Repository baseline

- Repository structure, configuration and conventions.
- Docker Compose for Qdrant.
- Ollama connectivity.
- SQLite schema.
- Basic API, CLI and Web UI.
- Watch directory lifecycle.

**Exit criterion:** `maia-rag doctor` passes and one TXT/MD document can be indexed and queried.

## Milestone 1 — Useful document RAG

- Stabilize PDF/DOCX/TXT/MD ingestion.
- Batch embeddings and configurable embedding dimensions.
- Job/progress table and asynchronous internal queue.
- Robust metadata schema with provenance.
- Collections and automatic collection assignment.
- Source citation objects with page/section/line information.
- Duplicate handling and document deletion.
- Reprocess/re-embed commands.

**Exit criterion:** a mixed academic corpus can be dropped unattended and queried with traceable citations.

## Milestone 2 — Source-code intelligence

- Tree-sitter adapters for JS/TS, Python, C/C++, Java, Go, Rust and MaiaScript grammar integration where practical.
- Symbol metadata, imports, function/class boundaries.
- Repository ingestion (`git` directory), ignore rules and `.maiaragignore`.
- Lexical/BM25 retrieval and hybrid fusion.

**Exit criterion:** exact identifiers and conceptual code questions both retrieve useful code evidence.

## Milestone 3 — Retrieval quality

- Reranker adapter and local reranking model.
- Query rewriting/expansion where justified.
- Context budgeter and de-duplication of overlapping chunks.
- Retrieval evaluation dataset and quality metrics.
- Strict/Auto/Off modes for Maia Chat.

## Milestone 4 — Operations and multi-user

- PostgreSQL migration.
- Worker queue with concurrency/back-pressure.
- Authentication/authorization.
- Per-collection ACLs.
- Audit log.
- Metrics endpoint and dashboards.
- Backup/restore tooling.

## Milestone 5 — Advanced knowledge service

- OCR pipeline for scanned documents.
- Tables and figures extraction.
- Knowledge/code graph.
- Document version lineage.
- Remote ingestion adapters (Git repositories, controlled URLs, object storage).
- Optional distributed Qdrant/PostgreSQL deployment.
