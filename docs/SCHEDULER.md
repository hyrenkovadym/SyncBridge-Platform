# Scheduler (Phase 7)

## Controls
- `SCHEDULER_ENABLED`
- `SCHEDULER_POLL_INTERVAL_SECONDS`
- `SCHEDULER_LOCK_TTL_SECONDS`

Scheduler polling runs in worker role only.

## Endpoints
- `GET /api/scheduler/status`
- `PATCH /api/pipelines/:id/schedule`
- `GET /api/pipelines/:id/schedule`
- `POST /api/pipelines/:id/schedule/trigger`

## Observability
Scheduler status includes:
- enabled/process role
- poll interval and lock TTL
- last tick timestamp and duration
- last due/enqueued/skipped counts
- last safe error message

Audit events:
- `scheduler_tick_started`
- `scheduler_tick_completed`
- `scheduler_tick_failed`
- `scheduled_pipeline_skipped`

## Execution Rules
- only ACTIVE scheduled pipelines are polled
- PAUSED/ARCHIVED pipelines are skipped
- duplicate enqueue prevention via active-run check
