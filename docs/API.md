# API Reference (Phase 7)

Base URL: `http://localhost:4100/api`

## Core
- `GET /health`
- `GET /ready`
- `GET /system/info`

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`

## Connectors
- `POST /connectors`
- `GET /connectors`
- `GET /connectors/:id`
- `PATCH /connectors/:id`
- `PATCH /connectors/:id/status`

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

## Jobs
- `GET /jobs/:id`

## Webhooks
- `POST /webhooks/:connectorId/events`
- `GET /webhooks/events`
- `GET /webhooks/events/:id`
- `GET /webhooks/events/:id/job`
- `POST /webhooks/events/:id/retry`
- `POST /webhooks/events/:id/process`

## Dashboard
- `GET /dashboard/summary`

## Error Shape
All API errors return:
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "path": "/api/auth/login",
  "timestamp": "2026-05-27T00:00:00.000Z",
  "requestId": "..."
}
```

## Request ID
- Accepts incoming `X-Request-ID`
- Generates one if missing
- Always returns `X-Request-ID` in response headers
