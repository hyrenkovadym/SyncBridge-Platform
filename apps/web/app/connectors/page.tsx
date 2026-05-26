import Link from 'next/link';

import { PlaceholderCard } from '../../components/placeholder-card';

export default function ConnectorsPage() {
  return (
    <>
      <section className="card">
        <h2>Connectors</h2>
        <p>Connector list UI placeholder. API wiring and table filtering will be added in Phase 2.</p>
        <small>
          Create a new connector: <Link href="/connectors/new">/connectors/new</Link>
        </small>
      </section>

      <section className="grid">
        <PlaceholderCard
          title="Example Connector"
          description="Type: WEBHOOK | Status: ACTIVE"
          hint="No real credentials should be stored in configJson."
        />
      </section>
    </>
  );
}
