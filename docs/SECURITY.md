# SyncBridge Platform Security Notes (Phase 1)

## No Secrets Policy
- Never commit real credentials, API keys, tokens, or private company data.
- `.env.example` contains placeholders only.
- Use local `.env` for development secrets and keep it ignored by git.

## Connector Credential Warning
- `configJson` is intentionally generic in Phase 1.
- Do not store real credentials in `configJson`.
- In production, secrets should be fetched from a dedicated secret manager (for example: HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault).

## Webhook Security Notes
- Phase 1 webhook intake endpoint is public by design (`POST /api/webhooks/:connectorId/events`).
- It stores raw event payloads for later processing only.
- Future phases should add:
  - signature verification
  - replay protection
  - source allowlists
  - stricter payload validation
  - per-connector security policies

## JWT Notes
- Access and refresh secrets are mandatory environment variables.
- Passwords are hashed with bcrypt.
- Refresh token records are stored hashed.
- Future phases should include:
  - refresh token rotation and revocation endpoints
  - secure cookie or hardened client storage strategy
  - token anomaly detection

## RBAC Model
- Roles in Phase 1:
  - `USER`
  - `OPERATOR`
  - `ADMIN`
- Ownership checks are enforced for connector/pipeline/sync run access.
- Privileged roles can view global datasets when required.

## Database and Audit
- Critical actions are written to `AuditLog` (`user_registered`, `user_logged_in`, connector/pipeline/webhook/sync events).
- Future work should expand audit coverage and add retention policies.

## Future Security Recommendations
- Secret manager integration
- Rate limiting and abuse protection
- Data encryption strategy (at rest + in transit + sensitive payload fields)
- Centralized security monitoring and alerting
- Dependency and container vulnerability scanning in CI
