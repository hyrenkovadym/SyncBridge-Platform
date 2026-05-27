# SyncBridge Platform Architecture (Phase 5)

## Monorepo
- `apps/api` NestJS backend
- `apps/web` Next.js frontend
- `infra` Docker Compose
- `docs` architecture/API/roadmap/security/jobs/mapping/webhook docs

## Backend Modules
- `auth`, `users`, `connectors`, `pipelines`, `sync-runs`, `webhooks`, `dashboard`, `audit`, `health`, `prisma`
- Phase 3 module: `transformations`
- Phase 4 modules: `jobs`, `workers`
- Phase 5 extension: webhook processing orchestration in `webhooks` + worker processors

## Transformations Module
Responsibilities:
- mapping schema compile/validation
- type coercion/default/required handling
- safe nested path access (`getByPath` / `setByPath`)
- transformation error reporting

## Jobs and Workers
Queues:
- `sync-runs` (`execute-sync-run`)
- `webhooks` (`process-webhook-event`)

Worker entrypoint:
- `apps/api/src/worker.ts`

Processor classes:
- `apps/api/src/workers/sync-run.processor.ts`
- `apps/api/src/workers/webhook-event.processor.ts`

## Async Sync-Run Flow
1. API receives `POST /api/pipelines/:id/runs`.
2. In `QUEUE_MODE=async`, API creates queued `SyncRun` and queued `BackgroundJob`.
3. API enqueues `execute-sync-run`.
4. Worker executes run and writes synced records.
5. Job status is exposed by `/api/jobs/:id` and `/api/sync-runs/:id/job`.

## Webhook Processing Flow (Phase 5)
1. Intake endpoint `POST /api/webhooks/:connectorId/events` stores payload and redacted headers.
2. Duplicate idempotency key (`X-SyncBridge-Event-ID`) is ignored.
3. `QUEUE_MODE=async`:
   - create `BackgroundJob` (`WEBHOOK_PROCESSING`)
   - enqueue `process-webhook-event`
4. `QUEUE_MODE=sync`:
   - process immediately in API process.
5. Processing resolves active pipelines by `sourceConnectorId`.
6. For each active pipeline:
   - create sync run
   - transform webhook payload as one raw record
   - create synced record when transformation is valid
7. Webhook event status becomes `PROCESSED`, `FAILED`, or `IGNORED`.
8. Retry/manual endpoints can requeue processing for eligible events.

## Safety Design
- no secrets in connector config payloads
- sensitive webhook headers redacted
- idempotency key support to avoid duplicate processing
- mapping/path safety blocks prototype pollution vectors
- public job/event responses avoid stack traces and secret material

## Deferred
- real Google/1C integrations
- scheduler/incremental sync orchestration
- advanced transformation expression language
