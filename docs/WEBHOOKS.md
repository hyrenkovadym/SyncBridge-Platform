# Webhooks Guide (v1.0.0)

## Endpoints

- `POST /api/webhooks/:connectorId/events`
- `GET /api/webhooks/events`
- `GET /api/webhooks/events/:id`
- `GET /api/webhooks/events/:id/job`
- `POST /api/webhooks/events/:id/retry`
- `POST /api/webhooks/events/:id/process`

## Intake and Security

- Request headers are captured with redaction for sensitive keys.
- Idempotency key supported via `X-SyncBridge-Event-ID`.
- Duplicate events are safely ignored/idempotent.
- Payload size guard prevents oversized body ingestion.

## Event Lifecycle

- `RECEIVED`
- `PROCESSED`
- `FAILED`
- `IGNORED`

## Processing Flow

1. Persist redacted event.
2. Match active pipelines by source connector.
3. Create sync run(s).
4. Apply transformation engine.
5. Create synced record(s) for valid transformations.
6. Update event/job/run status and audit logs.

## Queue Behavior

- Sync mode (`QUEUE_MODE=sync`): process immediately.
- Async mode (`QUEUE_MODE=async`): enqueue `process-webhook-event` job and track `BackgroundJob`.

## Retry and Manual Process

- Retry endpoint is intended for failed events.
- Manual process endpoint allows controlled processing for received events.
- Both endpoints enforce ownership and RBAC checks.

## Future Hardening

- Provider signature verification
- Replay-window enforcement