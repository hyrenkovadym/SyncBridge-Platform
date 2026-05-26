import Link from 'next/link';

import { PlaceholderCard } from '../components/placeholder-card';

export default function HomePage() {
  return (
    <>
      <section className="card">
        <h2>Phase 1 Foundation</h2>
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
          description="Define external/internal data sources in a safe, role-aware API."
          hint="Credentials are placeholders in Phase 1."
        />
        <PlaceholderCard
          title="Pipelines"
          description="Create source-to-target sync pipelines with JSON mapping configuration."
          hint="Transformation engine arrives in Phase 3."
        />
        <PlaceholderCard
          title="Webhook Intake"
          description="Receive payloads and persist raw webhook events for later processing."
          hint="Retry and processing workers are planned for future phases."
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
