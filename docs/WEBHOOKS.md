# Webhook Processing Guide (Phase 5)

## Endpoints
- `POST /api/webhooks/:connectorId/events`
- `GET /api/webhooks/events`
- `GET /api/webhooks/events/:id`
- `GET /api/webhooks/events/:id/job`
- `POST /api/webhooks/events/:id/retry`
- `POST /api/webhooks/events/:id/process`

## Intake Rules
- Payload is stored as JSON after basic shape normalization.
- Sensitive headers are redacted (`authorization`, `cookie`, `x-api-key`, `x-auth-token`).
- `X-SyncBridge-Event-ID` enables per-connector idempotency.
- Duplicate idempotency key returns existing event and does not process twice.

## Lifecycle
- `RECEIVED`: accepted and waiting for processing.
- `PROCESSED`: processing flow finished.
- `FAILED`: processing failed safely.
- `IGNORED`: no active pipelines matched connector.

## Processing Flow
1. Resolve source connector from route `:connectorId`.
2. Resolve active pipelines where `sourceConnectorId` matches connector.
3. For each active pipeline:
   - create sync run
   - transform webhook payload using pipeline mapping
   - create synced record when valid
4. Finalize webhook event status and write audit events.

## Queue Modes
- `QUEUE_MODE=sync`: process immediately in API process.
- `QUEUE_MODE=async`: enqueue `process-webhook-event` in `webhooks` queue.

## Retry and Manual Processing
- Retry endpoint allows only `FAILED` events.
- Manual process endpoint allows reprocessing of non-finalized events.
- Ownership and role checks apply:
  - `USER`: own connector events
  - `OPERATOR`, `ADMIN`: all events

## Limitations
- No provider signature verification yet.
- No provider-specific schema normalization yet.
- No external system delivery/retry callbacks yet.
