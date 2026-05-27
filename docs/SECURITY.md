# SyncBridge Platform Security Notes (Phase 5)

## Secrets Policy
- No real credentials in repo.
- `configJson` rejects secret-like keys.
- Use external secret manager in production.

## Transformation Safety
- Nested path operations reject dangerous segments:
  - `__proto__`
  - `prototype`
  - `constructor`
- This protects against prototype pollution vectors in mapping paths.

## Mapping Validation Controls
- Mapping payload is validated before pipeline create/update and via explicit validation endpoint.
- Unsupported types are rejected.
- Unsafe paths are rejected.

## Data Handling
- Preview endpoint does not persist sync runs or records.
- Transformation audit metadata includes counts and identifiers, not full raw payload dumps.
- Background job endpoints expose sanitized status metadata only (no stack traces).

## Auth and RBAC
- Access token + refresh token flow in place.
- Refresh token rotation/revocation supported.
- Role and ownership controls enforced for preview/run operations.

## Webhook Intake Security
- Sensitive header redaction.
- Idempotency support with `X-SyncBridge-Event-ID`.

## Webhook Processing Security (Phase 5)
- Webhook events are processed through controlled queue/worker flow in async mode.
- Duplicate idempotency keys are ignored to prevent duplicate processing.
- Retry/manual processing endpoints are role and ownership scoped.
- Public event/job responses store safe error messages only.
- Processing metadata in audit logs avoids full payload dumps.

## Current Limitations
- No cryptographic webhook signature verification yet.
- No field-level data masking in persisted payloads yet.
- Queue payloads are internal to Redis and should be protected by network boundaries.

## Next Security Priorities
- Signature verification and replay windows for webhook providers.
- Extended observability and alerting around transformation failures.
- Per-tenant queue isolation and stricter worker runtime hardening.
