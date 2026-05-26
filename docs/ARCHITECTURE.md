# SyncBridge Platform Architecture (Phase 1)

## Monorepo Structure
SyncBridge uses an npm workspace monorepo:

- `apps/api` - NestJS backend service
- `apps/web` - Next.js frontend skeleton
- `infra` - Docker Compose for local infrastructure
- `docs` - architecture, roadmap, and security documentation

## API Service (`apps/api`)
The API is modular and backend-heavy by design:

- `auth` - registration, login, current user endpoint, JWT foundation
- `users` - user persistence helpers
- `connectors` - data source definitions and ownership access rules
- `pipelines` - sync pipeline definitions linked to connectors
- `webhooks` - public webhook intake storing raw events
- `sync-runs` - synchronous simulated run creation (Phase 1 only)
- `audit` - centralized audit log writes
- `health` - health and readiness endpoints
- `prisma` - Prisma client/provider

Global API details:
- Base URL prefix: `/api`
- Swagger docs: `/api/docs`
- ValidationPipe enabled globally

## Data Layer (PostgreSQL + Prisma)
Phase 1 models:

- `User`
- `RefreshToken`
- `Connector`
- `SyncPipeline`
- `SyncRun`
- `WebhookEvent`
- `SyncedRecord`
- `AuditLog`

This schema supports ownership checks, auditability, and lifecycle statuses for connectors, pipelines, runs, and webhook events.

## Redis Readiness
Redis is part of local infrastructure and environment config (`REDIS_URL`) but is not deeply integrated in Phase 1 yet.  
It is reserved for Phase 4+ workloads (queues, retries, background orchestration).

## Auth and RBAC
Authentication:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

RBAC:
- Roles: `USER`, `OPERATOR`, `ADMIN`
- `Roles` decorator + `RolesGuard`
- Ownership-aware service checks for connectors and pipelines

## Connectors and Pipelines Foundations
Connectors define source systems and configuration metadata (`configJson`).  
Pipelines define source-to-target sync intent (`mappingJson`, `targetName`, status).

Rules:
- `USER` sees own connectors/pipelines
- `OPERATOR`/`ADMIN` can see all
- updates are owner-or-privileged
- `USER` pipeline creation is limited to own connectors

## Webhook Intake (Phase 1)
`POST /api/webhooks/:connectorId/events` accepts arbitrary JSON payloads and stores:
- payload JSON
- headers JSON
- event type
- status (`RECEIVED`)

No processing pipeline runs yet; processing/retry logic is future phase work.

## Sync Runs (Phase 1)
Endpoints:
- `POST /api/pipelines/:id/runs`
- `GET /api/pipelines/:id/runs`
- `GET /api/sync-runs/:id`

Current behavior:
- creates a synchronous simulated run
- marks run `SUCCESS`
- optionally stores sample `SyncedRecord` rows
- no queue/worker/scheduler integration yet

## Future Architecture Direction
Planned evolution:
- background workers (BullMQ/Redis)
- retry and dead-letter strategies
- incremental sync scheduler
- transformation and mapping engine
- connector-specific adapters (REST/Google/1C/etc.)
- observability and security hardening
