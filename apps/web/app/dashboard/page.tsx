import { PlaceholderCard } from '../../components/placeholder-card';

export default function DashboardPage() {
  return (
    <>
      <section className="card">
        <h2>Dashboard</h2>
        <p>Operational summary placeholders for connectors, pipelines, runs, and webhook traffic.</p>
      </section>

      <section className="grid">
        <PlaceholderCard title="Active Connectors" description="0 (placeholder)" />
        <PlaceholderCard title="Active Pipelines" description="0 (placeholder)" />
        <PlaceholderCard title="Recent Sync Runs" description="0 (placeholder)" />
        <PlaceholderCard title="Webhook Events (24h)" description="0 (placeholder)" />
      </section>
    </>
  );
}
