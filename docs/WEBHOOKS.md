# Webhooks (Phase 7)

## Endpoints
- `POST /api/webhooks/:connectorId/events`
- `GET /api/webhooks/events`
- `GET /api/webhooks/events/:id`
- `GET /api/webhooks/events/:id/job`
- `POST /api/webhooks/events/:id/retry`
- `POST /api/webhooks/events/:id/process`

## Intake Security
- Redacts sensitive headers (`authorization`, `cookie`, `x-api-key`, `x-auth-token`)
- Supports idempotency via `X-SyncBridge-Event-ID`
- Enforces payload size guard (`PayloadTooLargeException` when exceeded)

## Processing Lifecycle
- `RECEIVED`
- `PROCESSED`
- `FAILED`
- `IGNORED`

## Queue Integration
- Sync mode: process immediately
- Async mode: enqueue `process-webhook-event` and track `BackgroundJob`

## Retry/Manual Controls
- retry endpoint requires `FAILED`
- process endpoint only for non-finalized events
- ownership/RBAC checks enforced

## Future Hardening (Planned)
- provider signature verification
- replay-window enforcement
