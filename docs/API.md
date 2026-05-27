# SyncBridge API Reference (Phase 4)

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

## Connectors
- `POST /connectors`
- `GET /connectors`
- `GET /connectors/:id`
- `PATCH /connectors/:id`
- `PATCH /connectors/:id/status`

Connector config policy:
- `configJson` must be an object.
- Secret-like keys are rejected (`password`, `token`, `apiKey`, etc.).

## Pipelines
- `POST /pipelines`
- `GET /pipelines`
- `GET /pipelines/:id`
- `PATCH /pipelines/:id`
- `PATCH /pipelines/:id/status`
- `POST /pipelines/:id/preview`
- `POST /pipelines/validate-mapping`

### Mapping Format (Primary)
```json
{
  "fields": {
    "email": { "path": "contact.email", "required": true, "type": "string" },
    "fullName": { "path": "contact.name", "default": "Unknown", "type": "string" },
    "amount": { "path": "invoice.total", "type": "number" },
    "isActive": { "path": "active", "type": "boolean", "default": true }
  }
}
```

Supported field options:
- `path`
- `required`
- `default`
- `type`: `string | number | boolean | date | json`
- `trim`, `lowercase`, `uppercase` (for strings)
- `compute`: `now | uuid` (simple deterministic computed values)

### Validate Mapping
`POST /pipelines/validate-mapping`

Request:
```json
{
  "mappingJson": { "fields": { "email": { "path": "contact.email", "type": "string" } } }
}
```

Response:
```json
{
  "valid": true,
  "errors": []
}
```

### Preview Transformation
`POST /pipelines/:id/preview`

Request:
```json
{
  "records": [
    {
      "externalId": "1",
      "raw": {
        "contact": { "email": "USER@EXAMPLE.COM" }
      }
    }
  ]
}
```

Response:
```json
{
  "pipelineId": "...",
  "results": [
    {
      "externalId": "1",
      "raw": { "contact": { "email": "USER@EXAMPLE.COM" } },
      "normalized": { "email": "user@example.com" },
      "errors": []
    }
  ],
  "summary": {
    "recordsReceived": 1,
    "recordsValid": 1,
    "recordsInvalid": 0
  }
}
```

## Sync Runs
- `POST /pipelines/:id/runs`
- `GET /pipelines/:id/runs`
- `GET /sync-runs/:id`
- `GET /sync-runs`
- `GET /sync-runs/:id/job`

Run creation (`POST /pipelines/:id/runs`) accepts:
```json
{
  "mockRecords": [
    {
      "externalId": "1",
      "raw": {
        "contact": { "email": "user@example.com" }
      }
    }
  ]
}
```

Behavior in `QUEUE_MODE=sync`:
- Uses transformation engine per record immediately.
- Persists `SyncedRecord` only for valid transformed records.
- Updates run counters (`recordsReceived`, `recordsProcessed`, `recordsFailed`).
- Run status becomes `FAILED` if at least one record fails transformation.

Behavior in `QUEUE_MODE=async`:
- Creates `SyncRun` in `QUEUED` state.
- Creates `BackgroundJob` in `QUEUED` state.
- Enqueues `execute-sync-run` job in BullMQ queue `sync-runs`.
- Returns immediately:
```json
{
  "jobId": "background-job-id",
  "syncRunId": "sync-run-id",
  "pipelineId": "pipeline-id",
  "status": "QUEUED",
  "message": "Sync run queued for background execution."
}
```

Worker execution updates:
- `SyncRun` (`QUEUED -> RUNNING -> SUCCESS|FAILED`)
- `BackgroundJob` (`QUEUED -> PROCESSING -> COMPLETED|FAILED`)
- counters and timestamps

## Jobs
- `GET /jobs/:id`

Response shape:
```json
{
  "id": "job-id",
  "type": "SYNC_RUN",
  "status": "QUEUED",
  "entityType": "sync_run",
  "entityId": "sync-run-id",
  "attempts": 0,
  "lastError": null,
  "metadataJson": {},
  "createdAt": "2026-01-01T00:00:00.000Z",
  "startedAt": null,
  "finishedAt": null,
  "durationMs": null
}
```

Access rules:
- `USER`: only jobs for owned pipelines/runs
- `OPERATOR`, `ADMIN`: global visibility

## Webhooks
- `POST /webhooks/:connectorId/events`
- `GET /webhooks/events`
- `GET /webhooks/events/:id`

Security behavior:
- Sensitive header redaction.
- Idempotency support via `X-SyncBridge-Event-ID`.

## Dashboard
- `GET /dashboard/summary`

## Access Rules
- `USER`: own resources only.
- `OPERATOR`, `ADMIN`: global visibility where allowed.
