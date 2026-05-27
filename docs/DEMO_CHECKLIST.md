# Demo Checklist (v1.0.0)

## 1. Start Runtime

1. Ensure Docker Desktop or Docker Engine is running.
2. Start services:
   - `docker compose -f infra/docker-compose.yml up -d --build postgres redis api worker web`
3. Verify containers:
   - `docker compose -f infra/docker-compose.yml ps`

## 2. Database Setup

1. Generate Prisma client:
   - `npm run prisma:generate -w @syncbridge/api`
2. Apply schema (demo environment):
   - `npx prisma db push --schema=apps/api/prisma/schema.prisma`
3. Seed demo data:
   - `npm run prisma:seed -w @syncbridge/api`

## 3. Access URLs

- Frontend: `http://localhost:3001`
- API: `http://localhost:4100/api`
- Swagger: `http://localhost:4100/api/docs`

## 4. Auth and User Flow

1. Login as `user@example.com` / `Password123!`.
2. Confirm dashboard loads with seeded counts.

## 5. Connector Flow

1. Open Connectors page.
2. Create a connector with safe demo config JSON.
3. Attempt to submit config with `token` key and verify rejection.

## 6. Pipeline Flow

1. Open Pipelines page.
2. Create a pipeline linked to a connector.
3. Add mapping JSON and run mapping preview.
4. Verify normalized result and errors rendering.

## 7. Manual Sync Flow

1. Trigger a manual sync run from pipeline UI.
2. Confirm sync run appears on Sync Runs page.
3. Confirm status and counters (`recordsReceived`, `recordsProcessed`, `recordsFailed`).
4. Verify synced records exist in DB (optional Prisma Studio/SQL check).

## 8. Webhook Flow

1. Send webhook event:
   - `POST /api/webhooks/{connectorId}/events`
2. Confirm event appears in Webhooks page.
3. If event fails, use retry/process actions.
4. Confirm related sync run and synced record are created for successful processing.

## 9. Scheduler Flow

1. Open pipeline detail page.
2. Enable schedule and set cron.
3. Trigger schedule manually (`/schedule/trigger`).
4. Verify run appears with `triggerType` = `SCHEDULED`.
5. Verify cursor updates for successful incremental runs.

## 10. Observability and Security

1. Check `GET /api/ready` returns safe DB/Redis/queue/scheduler status.
2. Check `GET /api/system/info` does not expose secrets.
3. Trigger a validation error and verify `requestId` in API error response.
4. Verify webhook headers are redacted in stored/listed events.
5. Verify connector config no-secrets policy is enforced.

## 11. API and Docs

1. Review Swagger docs at `/api/docs`.
2. Confirm major phase features are documented in `docs/`.