import { PlaceholderCard } from '../../components/placeholder-card';

export default function SyncRunsPage() {
  return (
    <>
      <section className="card">
        <h2>Sync Runs</h2>
        <p>Recent sync run list placeholder with status, counters, and timestamps.</p>
      </section>

      <section className="grid">
        <PlaceholderCard title="Run #1" description="SUCCESS | Received: 0 | Processed: 0 | Failed: 0" />
      </section>
    </>
  );
}
