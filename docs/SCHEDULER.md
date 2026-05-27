# Scheduler and Incremental Sync (Phase 6)

## Purpose
Phase 6 introduces a scheduler foundation for automatic pipeline execution and incremental checkpoints.

## Environment Variables
- `SCHEDULER_ENABLED=false`
- `SCHEDULER_POLL_INTERVAL_SECONDS=30`
- `SCHEDULER_LOCK_TTL_SECONDS=60`

Scheduler poller behavior:
- runs only when enabled
- runs only in worker role
- disabled during tests

## Pipeline Schedule Fields
Stored on `SyncPipeline`:
- `scheduleEnabled`
- `scheduleCron`
- `scheduleTimezone`
- `nextRunAt`
- `lastRunAt`
- `incrementalMode`
- `cursorJson`

## Endpoints
- `PATCH /api/pipelines/:id/schedule`
- `GET /api/pipelines/:id/schedule`
- `POST /api/pipelines/:id/schedule/trigger`
- `GET /api/scheduler/status`

## Cron Rules
- 5-field cron format is required.
- Invalid cron/timezone is rejected.
- Enabling schedule requires non-empty cron expression.

## Enqueue Logic
On each poll:
1. query due active scheduled pipelines (`nextRunAt <= now`)
2. skip when active run (`QUEUED|RUNNING`) already exists
3. enqueue scheduled run (`triggerType=SCHEDULED`)
4. compute and persist next `nextRunAt`

## Incremental Cursor Rules
- When `incrementalMode=true` and `ignoreCursor=false`, records older than cursor are skipped.
- Cursor advances only on fully successful run.
- On failed run, cursor is unchanged.

## Trigger Types
- Manual endpoint run: `MANUAL`
- Webhook-driven run: `WEBHOOK`
- Scheduler run: `SCHEDULED`

## Limitations
- No distributed DB lock yet (simple per-process lock + DB active-run check).
- No provider-specific incremental cursor adapters yet.
