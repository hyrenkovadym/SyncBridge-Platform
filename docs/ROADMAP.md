# SyncBridge Platform Roadmap

## Phase 1 (Completed)
- Monorepo/API foundation
- auth/RBAC/connectors/pipelines/webhook intake baseline

## Phase 2 (Completed)
- Frontend wiring and auth session UX
- refresh/logout
- connector/pipeline status and validation hardening

## Phase 3 (Completed)
- transformation engine
- mapping validation + preview
- safe path utilities

## Phase 4 (Completed)
- BullMQ sync-run background jobs
- worker process + job status APIs

## Phase 5 (Completed)
- webhook processing queue/worker
- webhook lifecycle + retry/manual processing

## Phase 6 (Completed)
- scheduler endpoints and polling foundation
- scheduled sync enqueue flow
- incremental cursor/checkpoint foundation
- run trigger-type tracking (`MANUAL`, `WEBHOOK`, `SCHEDULED`)

## Phase 7 (Next)
- observability and security polish
- metrics/alerts, tighter audit reporting, operational hardening

## Phase 8 (Future)
- production-readiness pass
- portfolio/demo packaging
