# SyncBridge Platform

API/Data Integration & Automation Platform.

## Current Phase
Phase 7 completed: observability and security hardening.

## Stack
- NestJS API + worker
- TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ
- JWT auth + RBAC
- Next.js frontend
- Docker Compose
- Jest + Swagger

## Phase 7 Highlights
- Request IDs (`X-Request-ID`) with propagation to responses
- Structured JSON logs for API/worker events
- Global safe error response format with `requestId`
- Improved readiness and new system info endpoint:
  - `GET /api/health`
  - `GET /api/ready`
  - `GET /api/system/info`
- Middleware-based rate limiting on sensitive endpoints
- Helmet security headers and stricter CORS origin validation
- Audit metadata requestId enrichment
- Scheduler observability fields/events polish
- Frontend error visibility includes requestId when present

## Environment
Core:
- `QUEUE_MODE=sync|async`
- `BULLMQ_REDIS_URL`
- `BULLMQ_DEFAULT_ATTEMPTS`
- `BULLMQ_BACKOFF_MS`
- `SCHEDULER_ENABLED`
- `SCHEDULER_POLL_INTERVAL_SECONDS`
- `SCHEDULER_LOCK_TTL_SECONDS`
- `CORS_ORIGIN` (comma-separated origins)

Use `.env.example` as baseline.

## Commands
- `npm run prisma:generate -w @syncbridge/api`
- `npm run test -w @syncbridge/api`
- `npm run lint -w @syncbridge/api`
- `npm run build -w @syncbridge/api`
- `npm run build -w @syncbridge/web`
- `docker compose -f infra/docker-compose.yml config`

## URLs
- API: `http://localhost:4100/api`
- Swagger: `http://localhost:4100/api/docs`
- Frontend: `http://localhost:3001`

## Docs
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/OBSERVABILITY.md`
- `docs/SECURITY.md`
- `docs/JOBS.md`
- `docs/WEBHOOKS.md`
- `docs/MAPPING.md`
- `docs/SCHEDULER.md`
- `docs/ROADMAP.md`
