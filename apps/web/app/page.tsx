import Link from 'next/link';

import { PlaceholderCard } from '../components/placeholder-card';

export default function HomePage() {
  return (
    <>
      <section className="card">
        <h2>Phase 2 Integration Dashboard</h2>
        <p>
          SyncBridge Platform is a production-style portfolio project focused on backend integration
          architecture with NestJS, Prisma, PostgreSQL, and Redis-ready design.
        </p>
        <small>
          API base URL: <code>http://localhost:4100/api</code> | Swagger: <code>/api/docs</code>
        </small>
      </section>

      <section className="grid">
        <PlaceholderCard
          title="Connectors"
          description="Create connectors, enforce no-secrets config policy, and update status."
          hint="Credentials must not be stored in configJson."
        />
        <PlaceholderCard
          title="Pipelines"
          description="Create pipelines, run sync simulations, and monitor run counters."
          hint="Advanced transformation engine arrives in Phase 3."
        />
        <PlaceholderCard
          title="Webhook Intake"
          description="Receive events with header redaction and idempotency support."
          hint="Background processing and retries are planned for future phases."
        />
      </section>

      <section className="card">
        <h2>Quick Navigation</h2>
        <p>
          Use the main navigation or jump directly to <Link href="/dashboard">Dashboard</Link>.
        </p>
      </section>
    </>
  );
}
