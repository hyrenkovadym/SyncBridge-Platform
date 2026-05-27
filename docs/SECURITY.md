# SyncBridge Security Notes (Phase 6)

## Secret Handling
- No secrets committed to repo.
- Connector `configJson` rejects secret-like keys.
- Use external secret manager in production.

## Mapping/Transformation Safety
- Mapping validation rejects unsafe paths.
- Dangerous path segments blocked:
  - `__proto__`
  - `prototype`
  - `constructor`
- Prevents prototype-pollution path injection.

## Webhook Safety
- Sensitive headers are redacted before persistence.
- Supports idempotency via `X-SyncBridge-Event-ID`.
- Duplicate webhook IDs are not processed twice.

## Queue/Job Safety
- Public job/event APIs expose safe status + safe error messages only.
- Internal traces/secrets are not returned in public responses.
- Async retries are bounded by configured attempts/backoff.

## Scheduler/Incremental Safety (Phase 6)
- Scheduler disabled by default and test-disabled.
- Scheduler runs only in worker role when enabled.
- Duplicate prevention: active-run check avoids duplicate due-pipeline enqueue.
- Incremental cursor advances only on successful runs.
- Failed runs log `incremental_cursor_not_advanced` and preserve prior cursor.

## RBAC/Ownership
- USER scope is owner-only.
- OPERATOR/ADMIN have privileged visibility/control where defined.
- Schedule/update/trigger endpoints enforce role + ownership.

## Current Limitations
- No webhook signature verification yet.
- No tenant-isolated queues yet.
- No advanced payload masking on stored `payloadJson` yet.
