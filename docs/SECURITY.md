# Security Notes (v1.0.0)

## Repository Hygiene

- No secrets should be committed to git.
- Sensitive/local artifacts are ignored (`.env`, `.env.local`, `node_modules`, `.next`, `dist`, `coverage`, `logs`, credential-like files).
- Use `.env.example` as a template only.

## Authentication and Access Control

- JWT access + refresh token flow
- Refresh tokens are stored as hashes
- RBAC roles: `USER`, `OPERATOR`, `ADMIN`

## Connector Policy

Connector `configJson` rejects secret-like keys (for example `password`, `token`, `apiKey`, `secret`, `privateKey`, `accessToken`, `refreshToken`).

Recommendation: use a dedicated secret manager in production.

## Webhook Security

- Sensitive headers are redacted before persistence
- Idempotency key support via `X-SyncBridge-Event-ID`
- Payload size guarding is enforced in intake flow
- Retry/process endpoints are ownership/RBAC-protected

Future hardening: request signature verification and replay protection.

## Error and Logging Safety

- Global error responses are safe and consistent
- Public responses include `requestId`, not internal stack traces
- Structured logs intentionally exclude tokens, secrets, auth headers, and raw payload dumps

## Rate Limiting

- In-memory limiter for sensitive routes
- Good for local/single-instance usage
- Recommendation: distributed limiter (Redis-backed) in multi-instance production

## Transport Security

- Helmet security headers enabled
- CORS origins validated from config
- Production deployment should enforce HTTPS end-to-end

## Frontend Token Storage Note

Current demo frontend uses localStorage token persistence for simplicity.
Production hardening should evaluate secure cookie-based token handling and stricter session controls.