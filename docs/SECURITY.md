# Security Notes (Phase 7)

## Data Handling
- Connector config blocks secret-like keys.
- Webhook sensitive headers are redacted before storage.
- Public API errors do not expose internal stack traces.

## Request and Error Safety
- Request IDs are accepted/generated and returned via `X-Request-ID`.
- Global exception filter returns safe, consistent error payload.
- Internal exception details are logged, not returned.

## Rate Limiting
Applied to:
- auth register/login/refresh
- webhook intake
- pipeline run trigger
- transformation preview
- schedule trigger

Limits are middleware-managed and disabled in test mode.

## Runtime Headers/CORS
- Helmet security headers enabled.
- CORS origins validated as explicit `http/https` origins (or `*`).

## Audit Safety
- Audit metadata is requestId-enriched when request context exists.
- Sensitive secrets/tokens are intentionally not included.

## What Is Intentionally Not Logged
- JWT access/refresh tokens
- API keys / auth headers
- password hashes
- connector secrets
- full webhook payload dumps
- full raw sync records
