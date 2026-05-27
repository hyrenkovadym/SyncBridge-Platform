# API Reference (v1.0.0)

Base URL: `http://localhost:4100/api`
Swagger: `http://localhost:4100/api/docs`

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`

`/login` returns `accessToken` and `refreshToken`.

## System and Health

- `GET /health`
- `GET /ready`
- `GET /system/info`

`/ready` includes safe DB/Redis/queue/scheduler readiness metadata.

## Connectors

- `POST /connectors`
- `GET /connectors`
- `GET /connectors/:id`
- `PATCH /connectors/:id`
- `PATCH /connectors/:id/status`

Config policy rejects secret-like keys in `configJson`.

## Pipelines

- `POST /pipelines`
- `GET /pipelines`
- `GET /pipelines/:id`
- `PATCH /pipelines/:id`
- `PATCH /pipelines/:id/status`
- `POST /pipelines/:id/preview`
- `POST /pipelines/validate-mapping`
- `PATCH /pipelines/:id/schedule`
- `GET /pipelines/:id/schedule`
- `POST /pipelines/:id/schedule/trigger`

## Sync Runs

- `POST /pipelines/:id/runs`
- `GET /pipelines/:id/runs`
- `GET /sync-runs`
- `GET /sync-runs/:id`
- `GET /sync-runs/:id/job`

`POST /pipelines/:id/runs` supports sync or async behavior based on `QUEUE_MODE`.

## Jobs

- `GET /jobs/:id`

## Webhooks

- `POST /webhooks/:connectorId/events`
- `GET /webhooks/events`
- `GET /webhooks/events/:id`
- `GET /webhooks/events/:id/job`
- `POST /webhooks/events/:id/retry`
- `POST /webhooks/events/:id/process`

Webhook intake supports idempotency via `X-SyncBridge-Event-ID`.

## Dashboard

- `GET /dashboard/summary`

## Scheduler

- `GET /scheduler/status`

## Request ID and Error Shape

- Accepts inbound `X-Request-ID`
- Generates one if missing
- Returns `X-Request-ID` response header

Error payload format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "path": "/api/auth/login",
  "timestamp": "2026-05-27T00:00:00.000Z",
  "requestId": "c2730baf-..."
}
```

## Rate-Limited Endpoints

Basic in-memory limits are applied to:
- auth register/login/refresh
- webhook intake
- manual pipeline run trigger
- transformation preview
- schedule trigger

Limits are disabled in test environment.