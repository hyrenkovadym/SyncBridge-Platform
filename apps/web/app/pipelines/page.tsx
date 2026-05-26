import Link from 'next/link';

import { PlaceholderCard } from '../../components/placeholder-card';

export default function PipelinesPage() {
  return (
    <>
      <section className="card">
        <h2>Pipelines</h2>
        <p>
          Pipeline listing placeholder for source connector, target destination, status, and owner details.
        </p>
        <small>
          Create a new pipeline: <Link href="/pipelines/new">/pipelines/new</Link>
        </small>
      </section>

      <section className="grid">
        <PlaceholderCard
          title="Example Pipeline"
          description="Source: Connector A -> Target: internal_contacts"
          hint="Mapping engine and preview are planned for future phases."
        />
      </section>
    </>
  );
}
