# Webhook Processing Guide (Phase 6)

## Endpoints
- `POST /api/webhooks/:connectorId/events`
- `GET /api/webhooks/events`
- `GET /api/webhooks/events/:id`
- `GET /api/webhooks/events/:id/job`
- `POST /api/webhooks/events/:id/retry`
- `POST /api/webhooks/events/:id/process`

## Intake Safety
- Sensitive headers are redacted.
- `X-SyncBridge-Event-ID` is used for idempotency.
- Duplicate idempotency key returns existing event and skips duplicate processing.

## Lifecycle
- `RECEIVED`
- `PROCESSED`
- `FAILED`
- `IGNORED`

## Processing Flow
1. Event stored.
2. Event processed sync (`QUEUE_MODE=sync`) or queued (`QUEUE_MODE=async`).
3. Active pipelines are resolved from source connector.
4. Sync runs are created with trigger type `WEBHOOK`.
5. Transformation engine processes payload into synced records.
6. Event/job status finalized.

## Phase 6 Compatibility
- Scheduler/incremental logic does not change webhook routing.
- Webhook-created runs still use `WEBHOOK` trigger type.
- Incremental cursor handling remains in sync-run engine; webhook flow continues through same run pipeline.

## Limitations
- No provider signature validation yet.
- No provider-specific normalization templates yet.
