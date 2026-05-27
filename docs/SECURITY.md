# SyncBridge Platform Security Notes (Phase 2)

## No Secrets Policy
- Never commit real credentials, API keys, refresh tokens, or private company data.
- `.env.example` contains placeholders only.
- Use local `.env` for development-only secrets.

## Connector Configuration Policy
- `configJson` is allowed only for non-sensitive operational metadata.
- Secret-like keys are rejected (for example `password`, `token`, `apiKey`, `secret`, `privateKey`, `accessToken`, `refreshToken`).
- Error message:
  - `Connector credentials must not be stored in configJson. Use a secret manager in production.`

Production recommendation:
- Use a dedicated secret manager (Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault).

## JWT and Session Security
- Access tokens are short-lived.
- Refresh tokens are stored hashed in database records.
- `POST /auth/refresh` rotates refresh tokens and revokes prior token record.
- `POST /auth/logout` revokes current refresh token.
- Token hashes are never exposed via API responses.

## Webhook Intake Hardening
- Intake endpoint remains public by design:
  - `POST /api/webhooks/:connectorId/events`
- Phase 2 protections:
  - payload size check
  - header capture with sensitive header redaction
  - idempotency key support via `X-SyncBridge-Event-ID`
  - duplicate event protection per connector reference

### Redacted Header Keys
- `authorization`
- `cookie`
- `x-api-key`
- `x-auth-token`

## Access Control
Roles:
- `USER`
- `OPERATOR`
- `ADMIN`

Ownership enforcement:
- Users only see own connectors/pipelines/runs/webhook events.
- Privileged roles can view global datasets.
- Status updates are owner-or-privileged.

## Audit Coverage (Phase 2)
Audit events include:
- `user_registered`
- `user_logged_in`
- `user_logged_out`
- `refresh_token_rotated`
- `connector_created`
- `connector_status_updated`
- `pipeline_created`
- `pipeline_status_updated`
- `sync_run_created`
- `synced_record_created`
- `webhook_event_received`
- `webhook_event_duplicate_ignored`

## Future Security Work
- Webhook signature verification
- Replay protection windows and nonce tracking
- Rate limiting and abuse controls
- Encryption strategy for sensitive payload fields
- Centralized security monitoring + alerting
