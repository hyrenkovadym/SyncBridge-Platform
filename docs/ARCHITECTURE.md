# SyncBridge Platform Architecture (Phase 6)

## Monorepo
- `apps/api`: NestJS API + worker entrypoint
- `apps/web`: Next.js dashboard
- `infra`: Docker Compose
- `docs`: product and engineering documentation

## Core Backend Modules
- `auth`, `users`, `connectors`, `pipelines`, `sync-runs`, `webhooks`
- `transformations` (mapping engine)
- `jobs` (BullMQ queue abstraction)
- `workers` (processors)
- `scheduler` (Phase 6 schedule polling + schedule endpoints)
- `audit`, `dashboard`, `health`, `prisma`

## Queue/Worker Topology
- Queue `sync-runs` / job `execute-sync-run`
- Queue `webhooks` / job `process-webhook-event`
- Worker entrypoint: `apps/api/src/worker.ts`

## Scheduler Design (Phase 6)
- Polling is guarded by env:
  - `SCHEDULER_ENABLED=true`
  - process role must be `worker`
  - disabled in test env
- Poll cycle:
  1. find due active pipelines (`scheduleEnabled=true`, `nextRunAt <= now`)
  2. skip if active run exists (`QUEUED`/`RUNNING`)
  3. enqueue scheduled sync run
  4. compute and store next `nextRunAt`
- Duplicate prevention:
  - DB-visible active-run check per pipeline
  - local in-process poll lock

## Incremental Sync Foundation
- `SyncPipeline.cursorJson` stores last successful cursor snapshot
- `SyncPipeline.incrementalMode` toggles cursor filtering
- Sync run request can set `ignoreCursor=true` to process all records
- Cursor advances only on successful runs

## Trigger Types
- `MANUAL`: `POST /pipelines/:id/runs`
- `WEBHOOK`: webhook-driven processing
- `SCHEDULED`: scheduler/manual schedule trigger

## Safety Controls
- no-secrets connector policy
- webhook sensitive header redaction
- mapping path safety (`__proto__`, `prototype`, `constructor` blocked)
- role/ownership checks across schedule, run, job, webhook routes
