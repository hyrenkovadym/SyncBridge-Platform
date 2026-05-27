'use client';

import { useEffect, useState } from 'react';

import { ApiError, api } from '../../lib/api';
import { SyncRun, SyncRunStatus } from '../../lib/types';

const STATUS_FILTERS: Array<'ALL' | SyncRunStatus> = ['ALL', 'QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'];

export default function SyncRunsPage() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | SyncRunStatus>('ALL');

  useEffect(() => {
    const loadRuns = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await api.listSyncRuns({
          page: 1,
          limit: 30,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        });
        setRuns(result.items);
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Failed to load sync runs.');
        }
      } finally {
        setLoading(false);
      }
    };

    void loadRuns();
  }, [statusFilter]);

  return (
    <>
      <section className="card">
        <h2>Sync Runs</h2>
        <p>Recent simulated run history with counters and timestamps.</p>
        <div className="row-actions">
          <label htmlFor="statusFilter">Status</label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'ALL' | SyncRunStatus)}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading ? <section className="card">Loading sync runs...</section> : null}
      {errorMessage ? <section className="card error-card">{errorMessage}</section> : null}

      {!loading && runs.length === 0 ? <section className="card">No sync runs found.</section> : null}

      {!loading && runs.length > 0 ? (
        <section className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pipeline</th>
                <th>Status</th>
                <th>Received</th>
                <th>Processed</th>
                <th>Failed</th>
                <th>Started</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.pipeline?.name ?? run.pipelineId}</td>
                  <td>{run.status}</td>
                  <td>{run.recordsReceived}</td>
                  <td>{run.recordsProcessed}</td>
                  <td>{run.recordsFailed}</td>
                  <td>{run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}</td>
                  <td>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
