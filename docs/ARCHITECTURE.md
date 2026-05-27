# SyncBridge Platform Architecture (Phase 3)

## Monorepo
- `apps/api` NestJS backend
- `apps/web` Next.js frontend
- `infra` Docker Compose
- `docs` architecture/API/roadmap/security/mapping docs

## Backend Modules
- `auth`, `users`, `connectors`, `pipelines`, `sync-runs`, `webhooks`, `dashboard`, `audit`, `health`, `prisma`
- New in Phase 3: `transformations`

## Transformations Module
Location:
- `apps/api/src/transformations`

Responsibilities:
- Mapping schema compilation/validation
- Per-field transformation and coercion
- Required/default rule handling
- Safe nested path read/write
- Transformation error reporting

Key files:
- `transformation-engine.service.ts`
- `path-utils.ts`
- `transformation-errors.ts`
- DTOs for preview responses

## Mapping Pipeline Flow
1. Pipeline `mappingJson` is validated on create/update.
2. At sync run time, mapping is compiled once per run.
3. Each input record is transformed.
4. Valid results are stored in `SyncedRecord.normalizedJson`.
5. Invalid records increment `recordsFailed` and emit transformation failure audit events.

## Preview Flow
Endpoint:
- `POST /api/pipelines/:id/preview`

Behavior:
- Applies current pipeline mapping to provided sample records.
- Returns normalized results and per-record errors.
- Does not create `SyncRun` or `SyncedRecord` rows.

## Safety Design
- Path operations reject dangerous segments:
  - `__proto__`
  - `prototype`
  - `constructor`
- Mapping validation rejects unsupported types and unsafe paths.
- Transformation metadata in audit logs avoids full raw payload dumps.

## Frontend Integration
- `/pipelines/new`: mapping validation setup UX.
- `/pipelines/[id]`: transformation preview execution and result rendering.
- Shared API client methods added for preview/validation/detail fetch.

## Deferred (Not in Phase 3)
- Real external API connectors (Google, 1C)
- Job queues/workers (BullMQ)
- Scheduler
- Advanced rule engine beyond deterministic field mapping
