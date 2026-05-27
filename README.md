# SyncBridge Platform

**Subtitle:** API/Data Integration & Automation Platform

SyncBridge Platform is a production-style portfolio project focused on backend engineering for integration workflows.

Phase 4 introduces BullMQ-based background sync processing with a dedicated worker while preserving sync fallback mode for local/tests.

## Current Stack
- NestJS API
- TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ queue processing
- JWT auth + refresh token flow
- RBAC (`USER`, `OPERATOR`, `ADMIN`)
- Next.js frontend
- Jest + Supertest tests
- Swagger docs
- Docker Compose

## Phase 4 Highlights
- Queue mode toggle:
  - `QUEUE_MODE=sync` executes runs directly (local/test fallback)
  - `QUEUE_MODE=async` enqueues runs to BullMQ
- New jobs module and endpoints:
  - `GET /api/jobs/:id`
  - `GET /api/sync-runs/:id/job`
- New worker runtime:
  - `npm run worker -w @syncbridge/api`
  - `npm run worker:dev -w @syncbridge/api`
- Background job tracking in Prisma (`BackgroundJob` model).
- Async sync-run lifecycle audit events:
  - `sync_run_queued`, `sync_run_started`, `sync_run_completed`, `sync_run_failed`
  - `background_job_queued`, `background_job_started`, `background_job_completed`, `background_job_failed`
- Frontend async UX:
  - pipeline run action handles sync/async responses
  - queued jobs are polled and surfaced in `/pipelines` and `/sync-runs`

## Local Setup
1. Install dependencies:
```bash
npm install
```
2. Copy env template:
```bash
cp .env.example .env
```
3. Set queue mode (choose one):
```bash
QUEUE_MODE=sync
```
or
```bash
QUEUE_MODE=async
```
4. Generate Prisma client:
```bash
npm run prisma:generate -w @syncbridge/api
```
5. Run API:
```bash
npm run start:dev -w @syncbridge/api
```
6. Run worker (required when `QUEUE_MODE=async`):
```bash
npm run worker:dev -w @syncbridge/api
```
7. Run frontend:
```bash
npm run dev -w @syncbridge/web
```

## Main URLs
- API base: `http://localhost:4100/api`
- Swagger: `http://localhost:4100/api/docs`
- Frontend: `http://localhost:3001`

## Core Commands
- API tests: `npm run test -w @syncbridge/api`
- API lint: `npm run lint -w @syncbridge/api`
- API build: `npm run build -w @syncbridge/api`
- API worker (prod build): `npm run worker -w @syncbridge/api`
- Web build: `npm run build -w @syncbridge/web`
- Compose config check: `docker compose -f infra/docker-compose.yml config`

## Mapping Docs
Detailed mapping engine documentation:
- [docs/MAPPING.md](docs/MAPPING.md)

Detailed jobs/queue documentation:
- [docs/JOBS.md](docs/JOBS.md)

## Roadmap
See [docs/ROADMAP.md](docs/ROADMAP.md).
