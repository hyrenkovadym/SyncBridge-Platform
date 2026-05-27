# Jobs (Phase 7)

## Queue Modes
- `QUEUE_MODE=sync`: immediate execution in API process
- `QUEUE_MODE=async`: enqueue to BullMQ, process in worker

## Queues
- `sync-runs` / `execute-sync-run`
- `webhooks` / `process-webhook-event`

## BackgroundJob Observability
Stored fields include:
- `status`, `attempts`
- `startedAt`, `finishedAt`, `durationMs`
- `lastError` (safe message)
- safe `metadataJson` (IDs/counters only)

## Endpoints
- `GET /api/jobs/:id`
- `GET /api/sync-runs/:id/job`
- `GET /api/webhooks/events/:id/job`

## Security
- USER scope is ownership-limited
- OPERATOR/ADMIN can read all jobs
- responses avoid stack traces and secret material
