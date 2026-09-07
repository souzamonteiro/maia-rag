# Architecture Decisions

## ADR-001 — Maia RAG is independent from Maia Chat
**Decision:** expose a service API. **Reason:** the same knowledge layer must serve Chat, Studio, MaiaScript and future models.

## ADR-002 — Qdrant for vector storage
**Decision:** Qdrant is the default vector store. **Reason:** local deployment, filtering, mature API and growth path beyond an embedded prototype.

## ADR-003 — SQLite first, PostgreSQL later
**Decision:** SQLite stores v0.1 operational metadata. **Reason:** zero-admin local deployment. Schema/service boundaries must allow PostgreSQL migration.

## ADR-004 — Ollama for embeddings and classification
**Decision:** local Ollama APIs are the default model provider. **Reason:** private/offline operation and alignment with Maia Chat. Keep provider interfaces replaceable.

## ADR-005 — Automatic classification is non-blocking
**Decision:** AI confidence controls review signals, not ingestion success. **Reason:** the core UX is zero mandatory human classification.

## ADR-006 — Preserve originals and provenance
**Decision:** retain source artifacts and distinguish extracted/inferred/manual metadata. **Reason:** auditability, citations and future reprocessing.
