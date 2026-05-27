# SyncBridge Platform Roadmap

## Phase 1 (Completed)
- Monorepo foundation (API, web skeleton, docs, Docker, CI)
- Prisma schema + JWT/RBAC basics
- Connectors/pipelines foundations
- Webhook intake storage
- Simulated sync run creation
- Baseline audit logging

## Phase 2 (Completed)
- Frontend pages wired to live API endpoints
- Auth session lifecycle improvements (`refresh`, `logout`)
- Connector config validation with no-secrets policy
- Dedicated connector and pipeline status endpoints
- Sync run `mockRecords` support + basic mapping normalization
- Global sync runs listing with pagination/status filters
- Webhook idempotency key support and sensitive header redaction
- Webhook event listing endpoints with role-aware scoping
- Dashboard summary endpoint
- Expanded backend e2e coverage and updated docs

## Phase 3 (Next)
- Data mapping and transformation engine (broader than basic path mapping)
- Mapping preview and validation utilities
- Normalization templates and rule-based field transforms

## Phase 4
- Background sync jobs using BullMQ + Redis
- Worker process separation
- Queue-level error handling and retry policies

## Phase 5
- Webhook processing pipeline
- Retry/failure states and dead-letter handling
- Replay tooling for failed events

## Phase 6
- Scheduler and incremental sync support
- Cursor/checkpoint strategy per pipeline
- Rate limiting/throttling controls

## Phase 7
- Observability/security hardening
- Metrics, tracing, structured logs
- Expanded auth controls and compliance-oriented checks

## Phase 8
- Final portfolio release
- Production-readiness review
- Demo scripts and showcase documentation
