# Changelog

All notable changes to SyncBridge Platform are documented in this file.

## v1.0.0

- NestJS and TypeScript backend architecture
- Next.js frontend dashboard
- PostgreSQL with Prisma ORM
- Redis and BullMQ background processing
- JWT auth with refresh token flow
- RBAC (`USER`, `OPERATOR`, `ADMIN`)
- Connectors and pipelines management
- Connector no-secrets config policy
- Webhook intake with idempotency and header redaction
- Webhook processing queue with retry/manual processing
- Dedicated transformation engine and mapping validation
- Transformation preview endpoint
- Async sync runs with fallback sync mode
- Scheduler and incremental cursor foundation
- Trigger type tracking (`MANUAL`, `WEBHOOK`, `SCHEDULED`)
- BackgroundJob observability model
- Audit logs and dashboard summary
- Request IDs and structured logging
- Safe global error responses
- Rate limiting, CORS validation, Helmet headers
- Docker Compose stack (api, worker, web, postgres, redis)
- Jest test suite and GitHub Actions CI
- Professional documentation set for API, security, jobs, scheduler, and observability