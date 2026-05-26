# SyncBridge Platform Roadmap

## Phase 1 (Current)
- Monorepo foundation (API, web skeleton, docs, Docker, CI)
- Prisma schema + JWT/RBAC basics
- Connectors/pipelines foundations
- Webhook intake storage
- Simulated sync run creation
- Audit logging base

## Phase 2
- Real connector configuration workflows
- Frontend API wiring for auth/connectors/pipelines/sync runs
- Better connector validation UX

## Phase 3
- Data mapping and transformation engine
- Mapping previews and validation
- Normalization strategies for incoming records

## Phase 4
- Background sync jobs using BullMQ + Redis
- Worker process separation
- Queue-level error handling policies

## Phase 5
- Webhook processing pipeline
- Retry logic and failure states
- Dead-letter handling and replay tooling

## Phase 6
- Scheduler and incremental sync support
- Cursor/checkpoint strategy per pipeline
- Rate limiting and throttling controls

## Phase 7
- Observability/security polish
- Metrics, tracing, structured logs
- Advanced auth controls, hardening, and compliance checks

## Phase 8
- Final portfolio release
- Production-readiness review
- Demo scenario scripts and showcase documentation
