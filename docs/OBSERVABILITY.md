# Observability (Phase 7)

## Request ID Flow
- Reads incoming `X-Request-ID` when valid
- Generates request ID when missing
- Sets `X-Request-ID` response header
- Adds requestId to audit metadata when request context exists

## Structured Logging
JSON-style logs include safe fields:
- `timestamp`
- `level`
- `event`
- `requestId` (when available)
- `userId` (when available)
- entity IDs/counters/status/duration when relevant

No token/secret/header/payload dumps are logged.

## Error Observability
Global error payload:
- `statusCode`
- `message`
- `path`
- `timestamp`
- `requestId`

Internal details are logged server-side only.

## Runtime Endpoints
- `GET /api/health`: liveness
- `GET /api/ready`: DB + Redis/queue + scheduler readiness summary
- `GET /api/system/info`: safe runtime metadata only

## Job/Scheduler Visibility
- Job APIs expose attempts/duration/start/finish/error safely
- Scheduler status exposes last tick metrics and last safe error
