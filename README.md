# SyncBridge Platform

**Subtitle:** API/Data Integration & Automation Platform

SyncBridge is a production-style monorepo for integration workflows.  
Phase 6 adds scheduler-driven pipeline runs and incremental cursor foundations on top of existing queue/worker architecture.

## Stack
- NestJS API (`apps/api`)
- TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ
- JWT auth + refresh/logout
- RBAC (`USER`, `OPERATOR`, `ADMIN`)
- Next.js frontend (`apps/web`)
- Jest/Supertest
- Swagger
- Docker Compose

## Phase 6 Highlights
- Scheduler endpoints:
  - `PATCH /api/pipelines/:id/schedule`
  - `GET /api/pipelines/:id/schedule`
  - `POST /api/pipelines/:id/schedule/trigger`
  - `GET /api/scheduler/status`
- Scheduler polling foundation (worker role only when enabled)
- Cron + timezone validation
- Scheduled run enqueue safeguards (skip when active run already exists)
- Incremental cursor foundation:
  - `cursorJson` and `incrementalMode` on pipeline
  - optional `ignoreCursor` in `POST /api/pipelines/:id/runs`
- Sync run trigger types:
  - `MANUAL`, `WEBHOOK`, `SCHEDULED`
- Frontend schedule controls on pipeline pages

## Queue/Scheduler Modes
- `QUEUE_MODE=sync`
  - API executes sync runs immediately.
  - Best for tests/local fallback.
- `QUEUE_MODE=async`
  - API enqueues jobs; worker executes them.
- `SCHEDULER_ENABLED=true|false`
  - Scheduler poller runs only in worker role and non-test env.

## Local Setup
1. Install dependencies:
```bash
npm install
```
2. Create env file:
```bash
cp .env.example .env
```
3. Generate Prisma client:
```bash
npm run prisma:generate -w @syncbridge/api
```
4. Start API:
```bash
npm run start:dev -w @syncbridge/api
```
5. Start worker (required for async queue mode):
```bash
npm run worker:dev -w @syncbridge/api
```
6. Start web:
```bash
npm run dev -w @syncbridge/web
```

## URLs
- API: `http://localhost:4100/api`
- Swagger: `http://localhost:4100/api/docs`
- Web: `http://localhost:3001`

## Core Commands
- `npm run prisma:generate -w @syncbridge/api`
- `npm run test -w @syncbridge/api`
- `npm run lint -w @syncbridge/api`
- `npm run build -w @syncbridge/api`
- `npm run build -w @syncbridge/web`
- `docker compose -f infra/docker-compose.yml config`

## Docs
- [docs/API.md](docs/API.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/JOBS.md](docs/JOBS.md)
- [docs/WEBHOOKS.md](docs/WEBHOOKS.md)
- [docs/MAPPING.md](docs/MAPPING.md)
- [docs/SCHEDULER.md](docs/SCHEDULER.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
