# Jobs and Queue Processing (Phase 6)

## Queue Modes
- `QUEUE_MODE=sync`: runs execute in API process (test/local fallback).
- `QUEUE_MODE=async`: runs/events enqueue to BullMQ and execute in worker.

## Queues
- `sync-runs`
  - job name: `execute-sync-run`
- `webhooks`
  - job name: `process-webhook-event`

## Scheduler Integration
- Scheduler enqueues `SCHEDULED` sync runs through existing sync-run flow.
- Scheduler polling is controlled by:
  - `SCHEDULER_ENABLED`
  - `SCHEDULER_POLL_INTERVAL_SECONDS`
  - `SCHEDULER_LOCK_TTL_SECONDS`

## BackgroundJob Model
- type: `SYNC_RUN | WEBHOOK_PROCESSING`
- status: `QUEUED | PROCESSING | COMPLETED | FAILED`
- fields include: attempts, lastError, metadataJson, started/finished timestamps, duration

## Worker
- Entry: `apps/api/src/worker.ts`
- Commands:
  - `npm run worker -w @syncbridge/api`
  - `npm run worker:dev -w @syncbridge/api`

## Status Endpoints
- `GET /api/jobs/:id`
- `GET /api/sync-runs/:id/job`
- `GET /api/webhooks/events/:id/job`

## Retry Behavior
- Attempt/backoff is configured with:
  - `BULLMQ_DEFAULT_ATTEMPTS`
  - `BULLMQ_BACKOFF_MS`
- Sync-run/webhook failures update both domain entity and `BackgroundJob` safely.
