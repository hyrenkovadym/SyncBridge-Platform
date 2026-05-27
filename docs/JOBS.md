# Jobs and Worker Guide (v1.0.0)

## Queue Mode

- `QUEUE_MODE=sync`: run inline in API process (safe fallback)
- `QUEUE_MODE=async`: enqueue to BullMQ and process in worker

## Queues and Job Names

- Queue: `sync-runs`
  - Job: `execute-sync-run`
- Queue: `webhooks`
  - Job: `process-webhook-event`

## Worker Commands

- Production build worker:
  - `npm run worker -w @syncbridge/api`
- Development worker:
  - `npm run worker:dev -w @syncbridge/api`

## BackgroundJob Tracking

`BackgroundJob` stores:
- type/status
- entity linkage
- attempts
- started/finished timestamps
- durationMs
- safe lastError
- safe metadata IDs/counters

## Job Status APIs

- `GET /api/jobs/:id`
- `GET /api/sync-runs/:id/job`
- `GET /api/webhooks/events/:id/job`

Ownership applies to USER role; OPERATOR/ADMIN can view all.

## Retry and Failure Behavior

BullMQ attempts/backoff are controlled by:
- `BULLMQ_DEFAULT_ATTEMPTS`
- `BULLMQ_BACKOFF_MS`

Public APIs return safe failure messages only.