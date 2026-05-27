# Jobs and Queue Processing (Phase 4)

## Purpose
Phase 4 adds asynchronous sync-run processing with BullMQ while preserving synchronous fallback behavior.

## Queue Modes
- `QUEUE_MODE=sync`
  - `POST /api/pipelines/:id/runs` executes immediately in API process.
  - Best for tests and local no-worker setups.
- `QUEUE_MODE=async`
  - API enqueues job and returns queued response.
  - Worker processes records in background.

## Environment Variables
- `QUEUE_MODE=sync|async`
- `BULLMQ_REDIS_URL=redis://...`
- `BULLMQ_DEFAULT_ATTEMPTS=3`
- `BULLMQ_BACKOFF_MS=5000`

## Queue Topology
- Queue name: `sync-runs`
- Job name: `execute-sync-run`
- Payload includes:
  - `backgroundJobId`
  - `syncRunId`
  - `pipelineId`
  - `requestedByUserId`
  - `requestedByRole`
  - `mockRecords`

## Worker Runtime
Commands:
- `npm run worker -w @syncbridge/api`
- `npm run worker:dev -w @syncbridge/api`

Worker entrypoint:
- `apps/api/src/worker.ts`

Worker module:
- `apps/api/src/workers/workers.module.ts`
- `apps/api/src/workers/sync-run.processor.ts`

## Background Job Persistence
Prisma model: `BackgroundJob`

Main fields:
- `type` (`SYNC_RUN`)
- `status` (`QUEUED|PROCESSING|COMPLETED|FAILED`)
- `entityType`, `entityId`
- `attempts`
- `lastError`
- `metadataJson`
- timestamps and `durationMs`

## API Endpoints
- `GET /api/jobs/:id`
- `GET /api/sync-runs/:id/job`

Access rules:
- `USER`: own resources only
- `OPERATOR`, `ADMIN`: all resources

## Run Lifecycle
1. API creates queued `SyncRun` + queued `BackgroundJob`.
2. API enqueues BullMQ job.
3. Worker marks job/run processing.
4. Worker applies transformation engine and persists valid `SyncedRecord` rows.
5. Worker finalizes run/job state and counters.

## Retry and Failure Behavior
- Attempts/backoff are configured by env.
- Processor exceptions mark `BackgroundJob` as `FAILED`.
- Record-level transformation failures are tracked in run counters and run status.
- Public responses do not expose stack traces.

## Testing Strategy
- Existing e2e suite keeps `QUEUE_MODE=sync` stability.
- Unit coverage verifies:
  - sync fallback behavior
  - async enqueue flow
  - worker-style processing success/failure paths
