# SyncBridge API Reference (Phase 2)

Base URL:
- `http://localhost:4100/api`

Swagger:
- `http://localhost:4100/api/docs`

## Health
- `GET /health`
- `GET /ready`

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`

### Register/Login Response
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "fullName": "User",
    "role": "USER"
  }
}
```

### Refresh Request
```json
{
  "refreshToken": "..."
}
```

### Logout Request
```json
{
  "refreshToken": "..."
}
```

## Connectors
- `POST /connectors`
- `GET /connectors`
- `GET /connectors/:id`
- `PATCH /connectors/:id`
- `PATCH /connectors/:id/status`

### Connector Create/Update Rules
- `name` is required for create.
- `type` is required for create.
- `configJson` must be an object.
- `configJson` must not contain secret-like keys such as:
  - `password`
  - `token`
  - `apiKey`
  - `secret`
  - `privateKey`
  - `accessToken`
  - `refreshToken`

Violation error:
- `Connector credentials must not be stored in configJson. Use a secret manager in production.`

### Connector Status Endpoint
`PATCH /connectors/:id/status`
```json
{
  "status": "PAUSED"
}
```
Allowed values:
- `ACTIVE`
- `PAUSED`
- `ERROR`

## Pipelines
- `POST /pipelines`
- `GET /pipelines`
- `GET /pipelines/:id`
- `PATCH /pipelines/:id`
- `PATCH /pipelines/:id/status`

### Pipeline Status Endpoint
`PATCH /pipelines/:id/status`
```json
{
  "status": "ARCHIVED"
}
```
Allowed values:
- `ACTIVE`
- `PAUSED`
- `ARCHIVED`

## Sync Runs
- `POST /pipelines/:id/runs`
- `GET /pipelines/:id/runs`
- `GET /sync-runs/:id`
- `GET /sync-runs`

### Create Sync Run Request
```json
{
  "mockRecords": [
    {
      "externalId": "1",
      "raw": {
        "email": "test@example.com",
        "name": "Test User"
      }
    }
  ]
}
```

### Run Behavior
- Creates `SyncRun` row.
- Creates `SyncedRecord` rows for `mockRecords`.
- Applies simple `mappingJson` field mapping where possible.
- Returns run counters and summary.

### Global Runs Query Params
- `page` (default `1`)
- `limit` (default `20`, max `100`)
- `status` (optional)

## Webhooks
- `POST /webhooks/:connectorId/events`
- `GET /webhooks/events`
- `GET /webhooks/events/:id`

### Intake Headers
- Optional idempotency header: `X-SyncBridge-Event-ID`

Duplicate behavior:
- If the same event ID is received for the same connector reference, API returns existing event as duplicate.

### Sensitive Header Redaction
Headers are redacted for sensitive names:
- `authorization`
- `cookie`
- `x-api-key`
- `x-auth-token`

### Webhook Listing Query Params
- `page` (default `1`)
- `limit` (default `20`, max `100`)
- `status` (optional)

## Dashboard
- `GET /dashboard/summary`

Response fields:
- `connectorsCount`
- `pipelinesCount`
- `syncRunsCount`
- `webhookEventsCount`
- `failedRunsCount`
- `latestRuns`
- `latestWebhookEvents`

## Access Control Summary
- `USER`: sees own connectors/pipelines/runs/webhook events.
- `OPERATOR` and `ADMIN`: can view global data.
- Status updates are owner-or-privileged.
