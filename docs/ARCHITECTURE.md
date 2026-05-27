# Architecture (v1.0.0)

## Monorepo Layout

- `apps/api`: NestJS API + worker runtime
- `apps/web`: Next.js dashboard
- `infra`: Docker Compose runtime
- `docs`: product, security, and operations documentation

## Runtime Components

- API process (`apps/api/src/main.ts`)
- Worker process (`apps/api/src/worker.ts`)
- PostgreSQL for core state and audit history
- Redis for BullMQ queue backend

## Domain Modules

- `auth`: JWT access/refresh and RBAC guards
- `connectors`: source system metadata and config policy
- `pipelines`: mapping config, status, schedule controls
- `transformations`: deterministic mapping/coercion engine
- `sync-runs`: run lifecycle and record counters
- `webhooks`: intake, redaction, idempotency, processing controls
- `jobs`: queue orchestration and job status APIs
- `scheduler`: due pipeline polling and schedule trigger flow
- `dashboard`: summary endpoints for frontend
- `audit`: event trail for domain actions

## Queue Architecture

`QUEUE_MODE=sync|async`

- `sync-runs` queue, job: `execute-sync-run`
- `webhooks` queue, job: `process-webhook-event`

Background processing state is persisted in `BackgroundJob`.

## Scheduler Model

- Scheduler polling runs in worker role when `SCHEDULER_ENABLED=true`.
- Due pipelines are selected by `scheduleEnabled=true`, status `ACTIVE`, and `nextRunAt <= now`.
- Polling avoids duplicate enqueue for active queued/running runs.

## Incremental Sync Foundation

- `SyncPipeline.incrementalMode`
- `SyncPipeline.cursorJson`
- Run payload `ignoreCursor` for manual overrides
- Trigger type tracked on runs: `MANUAL`, `WEBHOOK`, `SCHEDULED`

## Security and Observability Baseline

- Request ID middleware and context propagation
- Structured JSON logging (API + worker)
- Safe global exception payloads
- Helmet headers and validated CORS origin handling
- In-memory rate limiting on sensitive endpoints
- Safe webhook header redaction and no-secrets connector config policy