# SyncBridge Platform

API/Data Integration & Automation Platform

SyncBridge Platform is a full-stack integration dashboard for ingesting external data, transforming it into normalized records, and executing sync workflows through manual runs, webhooks, and scheduled jobs.

## Product Summary

SyncBridge helps teams centralize integration logic that usually gets scattered across scripts, cron jobs, and webhook handlers.

### Problem Statement

Most small and mid-size teams need integrations, but usually lack:
- a single place to configure connectors and mapping rules;
- safe webhook processing with retries and auditability;
- predictable job execution and visibility across manual and scheduled syncs.

SyncBridge provides this as one platform.

### Target Users

- internal platform and automation teams;
- backend/full-stack engineers shipping partner integrations;
- operations teams needing traceable data sync runs.

## Key Features

- JWT auth with refresh token rotation and RBAC (`USER`, `OPERATOR`, `ADMIN`)
- Connector management with no-secrets-in-config policy
- Pipeline management with mapping validation
- Transformation engine with nested path mapping, coercion, defaults, and required validation
- Transformation preview endpoint before running real syncs
- Manual sync runs with sync or async queue mode
- BullMQ worker jobs with `BackgroundJob` tracking
- Webhook intake with idempotency, header redaction, processing queue, retry/manual process
- Scheduler with cron-based pipeline triggering and incremental cursor foundation
- Request IDs, structured logs, safe global error responses, audit logs, rate limiting, security headers
- Next.js dashboard wired to API for connectors, pipelines, runs, webhooks, and scheduler controls

## Tech Stack

- Backend: NestJS, TypeScript, Prisma ORM
- Database: PostgreSQL
- Queue/Worker: Redis, BullMQ
- Frontend: Next.js (App Router), TypeScript
- Auth/Security: JWT, RBAC, Helmet, request ID middleware, rate limiting
- Tooling: Docker Compose, Jest, ESLint, Swagger, GitHub Actions CI

## Architecture Overview

Monorepo layout:
- `apps/api`: API + worker runtime
- `apps/web`: frontend dashboard
- `infra`: Docker Compose stack
- `docs`: architecture/API/security/ops documentation

Runtime components:
- API service: request handling, auth, validation, orchestration
- Worker service: queue processing for sync runs, webhooks, scheduler polling
- PostgreSQL: transactional data and audit/history
- Redis: BullMQ queue backend

## Main Workflow

1. Register/login and obtain access + refresh tokens.
2. Create connectors (source systems) using safe config policy.
3. Create pipelines with mapping rules.
4. Preview transformation using sample records.
5. Trigger sync manually, by webhook, or by schedule.
6. Track run/job status and inspect normalized records.

## Connector Workflow

1. Create connector (`REST_API`, `WEBHOOK`, etc.).
2. Connector config is validated and rejects secret-like keys (`password`, `token`, `apiKey`, etc.).
3. Status can be managed (`ACTIVE`, `PAUSED`, `ERROR`) with RBAC and audit logging.

## Pipeline Workflow

1. Create pipeline linked to source connector.
2. Define `mappingJson` and validate mapping shape/safety.
3. Update status (`ACTIVE`, `PAUSED`, `ARCHIVED`).
4. Trigger run manually or through schedule/webhook.

## Transformation Workflow

- Engine reads `mappingJson.fields.<outputField>` definitions.
- Safe `getByPath`/`setByPath` utilities block dangerous keys.
- Supported coercion: `string`, `number`, `boolean`, `date`, `json`.
- Supports default values, required checks, and simple compute (`now`, `uuid`).
- Preview endpoint returns normalized output and per-record errors without persisting runs.

## Webhook Processing Workflow

1. Ingest event at `POST /api/webhooks/:connectorId/events`.
2. Redact sensitive headers before storing.
3. Enforce idempotency via `X-SyncBridge-Event-ID`.
4. Process event sync or async (based on queue mode).
5. Match active pipelines for source connector.
6. Create sync runs and synced records via transformation engine.
7. Support retry/manual process endpoints with permission checks.

## Background Jobs Workflow

- Queue mode:
  - `QUEUE_MODE=sync`: immediate in API process (local/test safe fallback)
  - `QUEUE_MODE=async`: enqueue to BullMQ worker
- Queues:
  - `sync-runs` / `execute-sync-run`
  - `webhooks` / `process-webhook-event`
- `BackgroundJob` persists queued/processing/completed/failed lifecycle and safe metadata.

## Scheduler and Incremental Sync Workflow

- Worker-side scheduler polls due pipelines when enabled.
- Pipeline schedule supports cron/timezone/next-run tracking.
- Manual trigger endpoint allows immediate queueing.
- Incremental foundation stores pipeline cursor (`cursorJson`) and supports `ignoreCursor` on manual runs.
- Sync run trigger types: `MANUAL`, `WEBHOOK`, `SCHEDULED`.

## Security and Observability Highlights

- Request IDs (`X-Request-ID`) propagated in responses and error payloads
- Structured JSON logs with safe metadata
- Global safe exception response shape
- Rate limiting on sensitive endpoints
- Helmet security headers and validated CORS origins
- Audit logs with request-aware metadata
- Readiness and system info endpoints without secret exposure

## Screenshots and Demo Placeholders

Add real screenshots in `docs/screenshots/`.

Planned image slots:
- Dashboard: `docs/screenshots/dashboard.png`
- Connectors: `docs/screenshots/connectors.png`
- Pipelines: `docs/screenshots/pipelines.png`
- Mapping Preview: `docs/screenshots/mapping-preview.png`
- Sync Runs: `docs/screenshots/sync-runs.png`
- Webhooks: `docs/screenshots/webhooks.png`
- Scheduler: `docs/screenshots/scheduler.png`
- Swagger API Docs: `docs/screenshots/swagger.png`

Placeholder guide: [docs/screenshots/README.md](docs/screenshots/README.md)

## Demo Credentials

After running seed:
- `admin@example.com` / `Password123!`
- `operator@example.com` / `Password123!`
- `user@example.com` / `Password123!`

## Quick Start (Docker)

Prerequisite: Docker Desktop (Windows/macOS) or Docker Engine (Linux) must be running.

```bash
docker compose -f infra/docker-compose.yml up -d --build postgres redis api worker web
```

Run database schema + seed:

```bash
npm run prisma:generate -w @syncbridge/api
npx prisma db push --schema=apps/api/prisma/schema.prisma
npm run prisma:seed -w @syncbridge/api
```

Useful Docker checks:

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f worker
```

## Local Development Setup

1. Install dependencies:
```bash
npm install
```

2. Create env file:
```bash
cp .env.example .env
```

3. Start infra services (postgres/redis) and run API/web locally:
```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
npm run start:dev -w @syncbridge/api
npm run dev -w @syncbridge/web
```

Optional worker in local dev:
```bash
npm run worker:dev -w @syncbridge/api
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection for readiness/system checks |
| `QUEUE_MODE` | `sync` or `async` execution mode |
| `BULLMQ_REDIS_URL` | Redis connection for BullMQ |
| `BULLMQ_DEFAULT_ATTEMPTS` | Default retry attempts for jobs |
| `BULLMQ_BACKOFF_MS` | Retry backoff in milliseconds |
| `SCHEDULER_ENABLED` | Enable worker scheduler polling |
| `SCHEDULER_POLL_INTERVAL_SECONDS` | Scheduler poll interval |
| `SCHEDULER_LOCK_TTL_SECONDS` | Scheduler lock TTL |
| `JWT_ACCESS_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend API base URL |

See `.env.example` for defaults.

## Runtime URLs

- API: `http://localhost:4100/api`
- Swagger: `http://localhost:4100/api/docs`
- Frontend: `http://localhost:3001`

## Worker Command

```bash
npm run worker -w @syncbridge/api
```

## Test and Quality Commands

```bash
npm run prisma:generate -w @syncbridge/api
npm run test -w @syncbridge/api
npm run lint -w @syncbridge/api
npm run build -w @syncbridge/api
npm run build -w @syncbridge/web
docker compose -f infra/docker-compose.yml config
```

## Known Limitations

- No live Google Sheets or 1C provider integrations yet
- No webhook signature verification yet (planned hardening)
- Local demo uses localStorage token storage in frontend
- Rate limiting is in-memory and should be replaced with distributed storage in multi-instance production
- Scheduler uses pragmatic duplicate-prevention logic, not a full distributed scheduler framework
- Transformation engine intentionally supports deterministic mapping rules only (no complex expression DSL)

## Roadmap

- v1.0.0: completed MVP with connectors, pipelines, mappings, jobs, webhooks, scheduler, and observability/security baseline
- Next: deployment templates, secret manager integration, webhook signature verification, distributed rate limit backend, and external provider adapters

Detailed plan: [docs/ROADMAP.md](docs/ROADMAP.md)

## Portfolio Summary

This project demonstrates:
- backend architecture with NestJS modules and pragmatic domain boundaries;
- secure API design (RBAC, refresh tokens, redaction, safe errors, request tracing);
- queue/worker orchestration with BullMQ and persisted job lifecycle;
- transformation engine design with validation and preview UX;
- full-stack integration delivery with docs, tests, Docker, and CI.

## Repository Metadata Suggestions

Suggested GitHub description:

`API/Data Integration & Automation Platform with NestJS, TypeScript, PostgreSQL, Prisma, Redis, BullMQ, webhooks, transformation engine, scheduler, incremental sync, RBAC, audit logs, Docker and CI.`

Suggested GitHub topics:

`nestjs`, `nodejs`, `typescript`, `postgresql`, `prisma`, `redis`, `bullmq`, `webhooks`, `data-integration`, `data-sync`, `api-integration`, `automation`, `workflow-automation`, `scheduler`, `docker`, `fullstack`