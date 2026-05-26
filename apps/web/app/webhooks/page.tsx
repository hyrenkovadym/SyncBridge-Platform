import { PlaceholderCard } from '../../components/placeholder-card';

export default function WebhooksPage() {
  return (
    <>
      <section className="card">
        <h2>Webhook Events</h2>
        <p>Stored webhook events placeholder list (received, processed, failed, ignored).</p>
      </section>

      <section className="grid">
        <PlaceholderCard
          title="customer.updated"
          description="Status: RECEIVED"
          hint="Processing pipeline and retries are planned for future phases."
        />
      </section>
    </>
  );
}
