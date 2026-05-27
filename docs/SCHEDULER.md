# Scheduler Guide (v1.0.0)

## Configuration

- `SCHEDULER_ENABLED` (default `false`)
- `SCHEDULER_POLL_INTERVAL_SECONDS` (default `30`)
- `SCHEDULER_LOCK_TTL_SECONDS` (default `60`)

Scheduler polling is executed by the worker role.

## Endpoints

- `GET /api/scheduler/status`
- `PATCH /api/pipelines/:id/schedule`
- `GET /api/pipelines/:id/schedule`
- `POST /api/pipelines/:id/schedule/trigger`

## Scheduling Rules

- Only `ACTIVE` pipelines can be scheduled.
- `PAUSED` and `ARCHIVED` pipelines are skipped.
- Duplicate enqueue is prevented for already queued/running runs.
- Cron validation rejects invalid or unsafe schedules.

## Observability

Scheduler status includes:
- enabled flag
- process role
- poll interval and lock TTL
- last poll timestamp and duration
- last due/enqueued/skipped counters
- last safe error message

Related audit/log events:
- `scheduler_tick_started`
- `scheduler_tick_completed`
- `scheduler_tick_failed`
- `scheduled_pipeline_skipped`