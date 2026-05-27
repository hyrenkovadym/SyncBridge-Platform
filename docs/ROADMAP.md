# Roadmap

## Released

### v1.0.0

- Core integration platform modules (auth, connectors, pipelines, sync runs)
- Transformation engine with mapping validation and preview
- Webhook intake, processing, retry/manual controls
- BullMQ worker queues and `BackgroundJob` lifecycle tracking
- Scheduler + incremental cursor foundation
- Dashboard endpoints and frontend integration pages
- Request IDs, structured logs, safe error handling
- Security baseline: no-secrets config policy, redaction, rate limiting, CORS/Helmet
- Docker Compose runtime and CI quality gates

## Next (Post-v1)

- External provider adapters (Google Sheets, 1C) with secret manager integration
- Webhook signature verification and replay-window protection
- Distributed rate limiting backend for horizontal scaling
- Deployment templates and production ops playbooks
- Observability exports (metrics/tracing) for managed monitoring stacks