# SyncBridge Platform Architecture (Phase 2)

## Monorepo Structure
SyncBridge uses an npm workspace monorepo:

- `apps/api` - NestJS backend API
- `apps/web` - Next.js dashboard frontend
- `infra` - Docker Compose local stack
- `docs` - architecture, API, roadmap, security docs

## Backend Modules (`apps/api`)
- `auth` - register/login/me + refresh/logout token lifecycle
- `users` - user persistence helpers
- `connectors` - connector CRUD, no-secrets config policy, status updates
- `pipelines` - pipeline CRUD, ownership checks, status updates
- `sync-runs` - simulated runs, mock record persistence, global runs listing
- `webhooks` - intake, idempotency key support, redacted header storage, event listing
- `dashboard` - summary metrics and latest activity feed
- `audit` - centralized audit event writing
- `health` - health/readiness endpoints
- `prisma` - Prisma client provider

Global API behavior:
- Base prefix: `/api`
- ValidationPipe with whitelist + transform + forbidNonWhitelisted
- Swagger UI on `/api/docs` (non-production)

## Data Model
Core Prisma models:
- `User`
- `RefreshToken`
- `Connector`
- `SyncPipeline`
- `SyncRun`
- `WebhookEvent`
- `SyncedRecord`
- `AuditLog`

Phase 2 model notes:
- `RefreshToken` supports revocation/rotation.
- `WebhookEvent` stores:
  - `sourceConnectorRef` (path connector reference)
  - optional resolved `connectorId`
  - optional `idempotencyKey`
  - redacted `headersJson`

## Auth and Session Flow
- Access token TTL is short-lived.
- Refresh token is persisted as bcrypt hash only.
- `POST /auth/refresh` verifies refresh token, revokes previous token row, and issues a new pair.
- `POST /auth/logout` revokes the provided current refresh token.

## Authorization Model
Roles:
- `USER`
- `OPERATOR`
- `ADMIN`

Enforcement:
- JWT guard for authenticated endpoints
- Roles guard for role checks
- Service-level ownership checks for connector/pipeline/sync run/webhook visibility

## Connector and Pipeline Configuration
Connector policy:
- `configJson` must be object-shaped.
- Secret-like keys are blocked by policy validation.

Pipeline policy:
- Users can only attach pipelines to connectors they own (unless privileged role).

## Sync Run Simulation (Phase 2)
- `POST /pipelines/:id/runs` accepts optional `mockRecords`.
- Each record produces `SyncedRecord` row linked to the run.
- Basic mapping normalization reads simple source-to-target path mappings.
- No queues/workers/schedulers yet (intentional for current phase).

## Webhook Intake Foundation (Hardened)
- Intake endpoint: `POST /webhooks/:connectorId/events`
- Captures headers with sensitive key redaction.
- Supports idempotency via `X-SyncBridge-Event-ID`.
- Applies payload size checks.
- Stores events safely for later processing phases.

## Dashboard Aggregation
- `GET /dashboard/summary` provides role-aware counts + latest activity.
- Users receive scoped metrics for owned entities.
- Operators/Admins receive global metrics.

## Frontend Integration (`apps/web`)
Phase 2 wiring:
- Shared typed API client in `lib/api.ts`
- Local demo session storage in `lib/auth.ts`
- Typed interfaces in `lib/types.ts`
- UI pages call live backend endpoints and show loading/empty/error states

## Deferred to Future Phases
Not added in Phase 2 by design:
- real Google API integration
- real 1C integration
- background workers (BullMQ)
- scheduler/orchestrator
- advanced transformation engine
