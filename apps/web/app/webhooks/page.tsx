'use client';

import { useEffect, useState } from 'react';

import { ApiError, api } from '../../lib/api';
import { BackgroundJob, WebhookEvent } from '../../lib/types';

export default function WebhooksPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobByEventId, setJobByEventId] = useState<Record<string, BackgroundJob | null>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionLoadingEventId, setActionLoadingEventId] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await api.listWebhookEvents({ page: 1, limit: 30 });
      setEvents(result.items);

      const jobResults = await Promise.all(
        result.items.map(async (event) => {
          try {
            const job = await api.getWebhookEventJob(event.id);
            return [event.id, job] as const;
          } catch {
            return [event.id, null] as const;
          }
        }),
      );

      setJobByEventId(Object.fromEntries(jobResults));
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

  useEffect(() => {
    void loadEvents();
  }, []);

  const processEvent = async (eventId: string) => {
    setActionLoadingEventId(eventId);
    setActionMessage(null);
    try {
      const response = await api.processWebhookEvent(eventId);
      setActionMessage(response.message ?? 'Webhook event processing requested.');
      await loadEvents();
    } catch (error) {
      if (error instanceof ApiError) {
        setActionMessage(error.message);
      } else {
        setActionMessage('Failed to process webhook event.');
      }
    } finally {
      setActionLoadingEventId(null);
    }
  };

  const retryEvent = async (eventId: string) => {
    setActionLoadingEventId(eventId);
    setActionMessage(null);
    try {
      const response = await api.retryWebhookEvent(eventId);
      setActionMessage(response.message ?? 'Webhook retry queued.');
      await loadEvents();
    } catch (error) {
      if (error instanceof ApiError) {
        setActionMessage(error.message);
      } else {
        setActionMessage('Failed to retry webhook event.');
      }
    } finally {
      setActionLoadingEventId(null);
    }
  };

  return (
    <>
      <section className="card">
        <h2>Webhook Events</h2>
        <p>Stored webhook intake events with redacted headers and role-aware visibility.</p>
        <small>POST /api/webhooks/{'{connectorId}'}/events</small>
      </section>

      <section className="card">
        <button className="secondary-button" onClick={() => void loadEvents()} disabled={loading}>
          Refresh
        </button>
        {actionMessage ? <p style={{ marginTop: '0.75rem' }}>{actionMessage}</p> : null}
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
                <th>Processed At</th>
                <th>Job</th>
                <th>Error</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.eventType}</td>
                  <td>{event.status}</td>
                  <td>{event.connector?.name ?? event.sourceConnectorRef}</td>
                  <td>{new Date(event.receivedAt).toLocaleString()}</td>
                  <td>{event.processedAt ? new Date(event.processedAt).toLocaleString() : '-'}</td>
                  <td>{jobByEventId[event.id]?.status ?? '-'}</td>
                  <td>{event.errorMessage ?? '-'}</td>
                  <td>
                    {event.status === 'FAILED' ? (
                      <button
                        className="secondary-button"
                        disabled={actionLoadingEventId === event.id}
                        onClick={() => void retryEvent(event.id)}
                      >
                        Retry
                      </button>
                    ) : null}
                    {event.status === 'RECEIVED' ? (
                      <button
                        className="secondary-button"
                        disabled={actionLoadingEventId === event.id}
                        onClick={() => void processEvent(event.id)}
                      >
                        Process
                      </button>
                    ) : null}
                  </td>
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
