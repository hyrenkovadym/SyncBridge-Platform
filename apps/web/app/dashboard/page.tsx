'use client';

import { useEffect, useState } from 'react';

import { ApiError, api } from '../../lib/api';
import { DashboardSummary } from '../../lib/types';

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await api.getDashboardSummary();
        setSummary(result);
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Failed to load dashboard summary.');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <>
      <section className="card">
        <h2>Dashboard</h2>
        <p>Operational summary of connectors, pipelines, sync runs, and webhook activity.</p>
      </section>

      {loading ? <section className="card">Loading dashboard...</section> : null}
      {errorMessage ? <section className="card error-card">{errorMessage}</section> : null}

      {summary ? (
        <>
          <section className="grid">
            <SummaryCard title="Connectors" value={summary.connectorsCount} />
            <SummaryCard title="Pipelines" value={summary.pipelinesCount} />
            <SummaryCard title="Sync Runs" value={summary.syncRunsCount} />
            <SummaryCard title="Webhook Events" value={summary.webhookEventsCount} />
            <SummaryCard title="Failed Runs" value={summary.failedRunsCount} />
          </section>

          <section className="card">
            <h2>Latest Sync Runs</h2>
            {summary.latestRuns.length === 0 ? (
              <p>No sync runs yet.</p>
            ) : (
              <ul className="simple-list">
                {summary.latestRuns.map((run) => (
                  <li key={run.id}>
                    <strong>{run.pipeline?.name ?? run.pipelineId}</strong> - {run.status} - processed{' '}
                    {run.recordsProcessed}/{run.recordsReceived}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Latest Webhook Events</h2>
            {summary.latestWebhookEvents.length === 0 ? (
              <p>No webhook events yet.</p>
            ) : (
              <ul className="simple-list">
                {summary.latestWebhookEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.eventType}</strong> - {event.status} - connector:{' '}
                    {event.connector?.name ?? event.sourceConnectorRef}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="metric-value">{value}</p>
    </section>
  );
}
