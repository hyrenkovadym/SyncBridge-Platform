# SyncBridge Platform

**Subtitle:** API/Data Integration & Automation Platform

SyncBridge Platform is a production-style portfolio project focused on backend engineering for integration workflows.

Phase 3 introduces a dedicated transformation engine with safe path handling, typed coercion, defaults, required validation, preview APIs, and frontend preview tooling.

## Current Stack
- NestJS API
- TypeScript
- PostgreSQL + Prisma
- Redis readiness
- JWT auth + refresh token flow
- RBAC (`USER`, `OPERATOR`, `ADMIN`)
- Next.js frontend
- Jest + Supertest tests
- Swagger docs
- Docker Compose

## Phase 3 Highlights
- New transformation engine module (`apps/api/src/transformations`).
- Mapping format with per-field rules:
  - `path`
  - `required`
  - `default`
  - `type` (`string`, `number`, `boolean`, `date`, `json`)
  - `compute` (`now`, `uuid`)
  - string transforms (`trim`, `lowercase`, `uppercase`)
- Safe path utilities (`getByPath`, `setByPath`) with dangerous segment rejection.
- Sync run integration now applies transformation engine per record.
- Transformation preview endpoint:
  - `POST /api/pipelines/:id/preview`
- Mapping validation endpoint:
  - `POST /api/pipelines/validate-mapping`
- Frontend transformation preview UI:
  - `/pipelines/new` (mapping validation prep)
  - `/pipelines/[id]` (preview execution/results)

## Local Setup
1. Install dependencies:
```bash
npm install
```
2. Copy env template:
```bash
cp .env.example .env
```
3. Generate Prisma client:
```bash
npm run prisma:generate -w @syncbridge/api
```
4. Run API:
```bash
npm run start:dev -w @syncbridge/api
```
5. Run frontend:
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
- Web build: `npm run build -w @syncbridge/web`
- Compose config check: `docker compose -f infra/docker-compose.yml config`

## Mapping Docs
Detailed mapping engine documentation:
- [docs/MAPPING.md](docs/MAPPING.md)

## Roadmap
See [docs/ROADMAP.md](docs/ROADMAP.md).
