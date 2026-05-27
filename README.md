# SyncBridge Platform

**Subtitle:** API/Data Integration & Automation Platform

SyncBridge Platform is a production-style portfolio project focused on backend engineering for data integration workflows.

Phase 1 delivered the monorepo foundation.
Phase 2 now wires the frontend to the API, adds refresh-token session flow, improves connector/pipeline operations, and hardens webhook intake handling.

## Phase 2 Highlights
- Frontend pages are now wired to live API data:
  - `/login`, `/register`, `/dashboard`, `/connectors`, `/connectors/new`, `/pipelines`, `/pipelines/new`, `/sync-runs`, `/webhooks`
- Auth session flow includes:
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - refresh-token rotation and revocation
- Connector and pipeline ops include dedicated status endpoints.
- Sync run simulation supports `mockRecords` and simple `mappingJson` normalization.
- Webhook intake includes:
  - idempotency key support via `X-SyncBridge-Event-ID`
  - payload-size checks
  - sensitive header redaction
  - role-aware event listing APIs
- Dashboard summary endpoint available at `GET /api/dashboard/summary`.

## Tech Stack
- Backend: NestJS, TypeScript, Prisma ORM
- Database: PostgreSQL
- Cache readiness: Redis
- Auth: JWT access + refresh tokens (hashed refresh token storage)
- RBAC: USER / OPERATOR / ADMIN
- Frontend: Next.js (App Router)
- Testing: Jest + Supertest
- Infra: Docker Compose
- CI: GitHub Actions

## Monorepo Structure
- `apps/api` - NestJS API
- `apps/web` - Next.js dashboard frontend
- `infra` - Docker Compose stack
- `docs` - architecture, API, roadmap, security notes

## Local Setup
1. Install dependencies:
```bash
npm install
```
2. Copy environment template:
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
5. Start web app:
```bash
npm run dev -w @syncbridge/web
```

## Docker Setup
```bash
docker compose -f infra/docker-compose.yml up --build
```

Services:
- API base: `http://localhost:4100/api`
- Swagger: `http://localhost:4100/api/docs`
- Frontend: `http://localhost:3001`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`

## Environment Variables
Defined in `.env.example`:
- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- `NEXT_PUBLIC_API_BASE_URL`

Use placeholder/demo values only. Never commit real secrets.

## API Surface
See [docs/API.md](docs/API.md) for complete endpoint list and request examples.

## Validation and Security Notes
- `configJson` must be an object and must not contain secret-like keys (`password`, `token`, `apiKey`, etc.).
- Refresh tokens are stored hashed in DB, never in plaintext.
- Webhook sensitive headers are redacted (`authorization`, `cookie`, `x-api-key`, `x-auth-token`).
- Webhook duplicate event IDs are idempotent per connector using `X-SyncBridge-Event-ID`.

## Commands
- API tests:
```bash
npm run test -w @syncbridge/api
```
- API lint:
```bash
npm run lint -w @syncbridge/api
```
- API build:
```bash
npm run build -w @syncbridge/api
```
- Web build:
```bash
npm run build -w @syncbridge/web
```

## Roadmap
See [docs/ROADMAP.md](docs/ROADMAP.md).

## Portfolio Positioning
SyncBridge demonstrates practical backend architecture skills:
- modular NestJS design
- role-aware and ownership-aware access control
- realistic data-integration entities and flows
- auditability and security-minded API decisions
- tested, documented, Dockerized monorepo delivery
