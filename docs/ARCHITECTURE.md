# Architecture (Phase 7)

## Monorepo
- `apps/api`: NestJS API and worker runtime
- `apps/web`: Next.js dashboard
- `infra`: Docker Compose
- `docs`: architecture, API, security, observability

## Runtime Layers
- API process (`main.ts`)
- Worker process (`worker.ts`)
- Shared queue infrastructure (`jobs` module)
- Domain modules: connectors, pipelines, sync-runs, webhooks, scheduler, transformations

## Queue/Worker
- Queue `sync-runs` / job `execute-sync-run`
- Queue `webhooks` / job `process-webhook-event`
- Background job state persisted in `BackgroundJob`

## Scheduler
- Poll loop in worker role when enabled
- Finds due active pipelines and enqueues scheduled runs
- Tracks last tick metadata for observability

## Incremental Foundation
- `SyncPipeline.cursorJson` and `incrementalMode`
- `ignoreCursor` manual override
- Trigger types tracked on runs: `MANUAL`, `WEBHOOK`, `SCHEDULED`

## Observability/Security Layer (Phase 7)
- Request context middleware (`X-Request-ID`)
- Structured JSON logging
- Global safe exception filter
- Rate limiting middleware on sensitive routes
- Helmet headers + validated CORS origin configuration
- Health/readiness/system runtime endpoints
