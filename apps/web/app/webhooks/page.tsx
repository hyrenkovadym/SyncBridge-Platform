'use client';

import { useEffect, useState } from 'react';

import { ApiError, api } from '../../lib/api';
import { WebhookEvent } from '../../lib/types';

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await api.listWebhookEvents({ page: 1, limit: 30 });
        setEvents(result.items);
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Failed to load webhook events.');
        }
      } finally {
        setLoading(false);
      }
    };

    void loadEvents();
  }, []);

  return (
    <>
      <section className="card">
        <h2>Webhook Events</h2>
        <p>Stored webhook intake events with redacted headers and role-aware visibility.</p>
        <small>POST /api/webhooks/{'{connectorId}'}/events</small>
      </section>

      {loading ? <section className="card">Loading webhook events...</section> : null}
      {errorMessage ? <section className="card error-card">{errorMessage}</section> : null}

      {!loading && events.length === 0 ? (
        <section className="card">No webhook events yet.</section>
      ) : null}

      {!loading && events.length > 0 ? (
        <section className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Status</th>
                <th>Connector</th>
                <th>Received At</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.eventType}</td>
                  <td>{event.status}</td>
                  <td>{event.connector?.name ?? event.sourceConnectorRef}</td>
                  <td>{new Date(event.receivedAt).toLocaleString()}</td>
                  <td>{event.errorMessage ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card">
        <h2>Webhook Test Helper</h2>
        <pre className="helper-block">{`curl -X POST "http://localhost:4100/api/webhooks/{connectorId}/events" \\
  -H "Content-Type: application/json" \\
  -H "X-SyncBridge-Event-ID: demo-event-1" \\
  -d '{"eventType":"customer.updated","customerId":"C-1001"}'`}</pre>
      </section>
    </>
  );
}
