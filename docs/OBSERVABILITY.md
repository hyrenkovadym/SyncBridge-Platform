# Observability Guide (v1.0.0)

## Request ID

- Uses inbound `X-Request-ID` when valid.
- Generates a request ID when missing.
- Returns `X-Request-ID` on all responses.
- Includes requestId in audit metadata when context is available.

## Structured Logs

API and worker emit JSON-style logs with safe fields:
- timestamp
- level
- event
- requestId (when present)
- userId/entity IDs/counters/status
- durationMs (when applicable)

Intentionally excluded:
- JWT/refresh tokens
- auth headers/API keys
- password hashes/secrets
- full webhook/raw record payload dumps

## Safe Error Contract

Global error shape:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "path": "/api/...",
  "timestamp": "...",
  "requestId": "..."
}
```

Internal stack traces are not exposed in public responses.

## Health and Runtime Endpoints

- `GET /api/health`: liveness check
- `GET /api/ready`: DB/Redis/queue/scheduler readiness summary
- `GET /api/system/info`: safe runtime metadata only

## Job and Scheduler Visibility

- Job APIs expose safe operational fields (`attempts`, `durationMs`, timestamps, safe errors)
- Scheduler status endpoint exposes latest tick metrics and safe error summary