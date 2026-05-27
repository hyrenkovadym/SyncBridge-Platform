# SyncBridge API Reference (Phase 6)

Base URL: `http://localhost:4100/api`  
Swagger: `http://localhost:4100/api/docs`

## Health
- `GET /health`
- `GET /ready`

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

## Scheduler (Phase 6)
- `PATCH /pipelines/:id/schedule`
- `GET /pipelines/:id/schedule`
- `POST /pipelines/:id/schedule/trigger`
- `GET /scheduler/status`

Schedule payload (`PATCH /pipelines/:id/schedule`):
```json
{
  "scheduleEnabled": true,
  "scheduleCron": "*/5 * * * *",
  "scheduleTimezone": "UTC",
  "incrementalMode": true
}
```

Rules:
- owner, `OPERATOR`, `ADMIN` can manage schedule
- archived pipelines cannot be scheduled
- paused pipelines cannot be schedule-triggered
- cron must be valid when scheduling is enabled

## Sync Runs
- `POST /pipelines/:id/runs`
- `GET /pipelines/:id/runs`
- `GET /sync-runs`
- `GET /sync-runs/:id`
- `GET /sync-runs/:id/job`

Run request payload:
```json
{
  "mockRecords": [
    { "externalId": "1", "raw": { "email": "user@example.com" } }
  ],
  "ignoreCursor": false
}
```

Trigger types:
- `MANUAL`
- `WEBHOOK`
- `SCHEDULED`

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
