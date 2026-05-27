# SyncBridge Platform Architecture (Phase 4)

## Monorepo
- `apps/api` NestJS backend
- `apps/web` Next.js frontend
- `infra` Docker Compose
- `docs` architecture/API/roadmap/security/mapping docs

## Backend Modules
- `auth`, `users`, `connectors`, `pipelines`, `sync-runs`, `webhooks`, `dashboard`, `audit`, `health`, `prisma`
- Added in Phase 3: `transformations`
- Added in Phase 4: `jobs`, `workers`

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

## Jobs Module (Phase 4)
Location:
- `apps/api/src/jobs`

Responsibilities:
- BullMQ enqueue abstraction
- Queue mode behavior (`sync` vs `async`)
- Job status endpoints and ownership checks

Core queue constants:
- Queue: `sync-runs`
- Job name: `execute-sync-run`

## Workers Module (Phase 4)
Location:
- `apps/api/src/workers`
- Worker entrypoint: `apps/api/src/worker.ts`

Responsibilities:
- Subscribe to BullMQ queue
- Execute queued sync runs using existing `SyncRunsService`
- Update `SyncRun` and `BackgroundJob` lifecycle states

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

## Async Sync-Run Flow
1. API receives `POST /api/pipelines/:id/runs`.
2. In `QUEUE_MODE=async`, API creates:
   - `SyncRun` (`QUEUED`)
   - `BackgroundJob` (`QUEUED`)
3. API enqueues BullMQ job and returns immediately.
4. Worker consumes job:
   - marks run/job as running
   - applies transformation engine to records
   - persists `SyncedRecord` rows
   - finalizes run/job state and counters
5. Job status becomes visible through `/api/jobs/:id` and `/api/sync-runs/:id/job`.

## Frontend Integration
- `/pipelines/new`: mapping validation setup UX.
- `/pipelines/[id]`: transformation preview execution and result rendering.
- Shared API client methods added for preview/validation/detail fetch.

## Deferred (Not in Phase 3)
- Real external API connectors (Google, 1C)
- Scheduler
- Advanced rule engine beyond deterministic field mapping

## Deferred (Still Not In Phase 4)
- Real external API connectors (Google, 1C)
- Scheduler
- BullMQ orchestration for webhook replay pipelines
