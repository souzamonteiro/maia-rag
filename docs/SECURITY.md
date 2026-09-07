# Security Model

Maia RAG handles potentially private corpora; local-first operation does not eliminate application-security requirements.

## Baseline

- Bind Ollama, Qdrant and administration API to loopback/private interfaces.
- Put TLS and authentication at the trusted ingress before remote access.
- Validate MIME/type and extension; do not execute uploaded content.
- Use randomized internal paths rather than trusting upload filenames.
- Enforce upload size and corpus quotas.
- Run service as an unprivileged account.
- Keep `originals/`, database and Qdrant storage outside the web root.
- Sanitize rendered metadata/text in the Web UI.
- Treat extracted document instructions as untrusted data; RAG context is vulnerable to prompt injection.

## RAG-specific prompt injection

Documents can contain text such as “ignore previous instructions”. The context builder and system prompt must mark retrieved text as evidence, never privileged instructions. Future versions should add document trust levels and optional injection detection.

## Sensitive metadata

AI-inferred metadata can itself leak document content. Access control must protect metadata and vectors with the same policy as originals.

## Supply chain

Pin/test dependencies before production release, automate vulnerability scanning and avoid processing via shell commands assembled from filenames.
