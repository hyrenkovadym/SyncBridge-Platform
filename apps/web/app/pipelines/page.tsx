'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ApiError, api } from '../../lib/api';
import { Connector, PipelineStatus, SyncPipeline } from '../../lib/types';

const PIPELINE_STATUS_OPTIONS: PipelineStatus[] = ['ACTIVE', 'PAUSED', 'ARCHIVED'];

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<SyncPipeline[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [pendingStatus, setPendingStatus] = useState<Record<string, PipelineStatus>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runningPipelineId, setRunningPipelineId] = useState<string | null>(null);
  const [updatingPipelineId, setUpdatingPipelineId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const connectorNameMap = useMemo(
    () =>
      connectors.reduce<Record<string, string>>((acc, connector) => {
        acc[connector.id] = connector.name;
        return acc;
      }, {}),
    [connectors],
  );

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [pipelinesResult, connectorsResult] = await Promise.all([api.listPipelines(), api.listConnectors()]);
      setPipelines(pipelinesResult);
      setConnectors(connectorsResult);
      setPendingStatus(
        pipelinesResult.reduce<Record<string, PipelineStatus>>((acc, pipeline) => {
          acc[pipeline.id] = pipeline.status;
          return acc;
        }, {}),
      );
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to load pipelines.');
      }
    } finally {
      setLoading(false);
    }
  };

  const runPipeline = async (pipelineId: string) => {
    setRunningPipelineId(pipelineId);
    setErrorMessage(null);
    setRunMessage(null);
    try {
      const result = await api.runPipeline(pipelineId);

      if ('jobId' in result) {
        setRunMessage(`Run queued (job ${result.jobId}). Waiting for completion...`);
        void pollJobUntilFinished(result.jobId);
      } else {
        setRunMessage(`Run finished with status ${result.status}.`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to start sync run.');
      }
    } finally {
      setRunningPipelineId(null);
    }
  };

  const pollJobUntilFinished = async (jobId: string, attempt = 0): Promise<void> => {
    if (attempt > 60) {
      setRunMessage(`Job ${jobId} is still running. Check /sync-runs for latest state.`);
      return;
    }

    try {
      const job = await api.getJob(jobId);
      if (job.status === 'COMPLETED') {
        setRunMessage(`Job ${jobId} completed.`);
        await loadData();
        return;
      }

      if (job.status === 'FAILED') {
        setRunMessage(`Job ${jobId} failed.`);
        await loadData();
        return;
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setRunMessage(`Job ${jobId} not found.`);
      } else if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to poll job status.');
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await pollJobUntilFinished(jobId, attempt + 1);
  };

  const updateStatus = async (pipelineId: string) => {
    const nextStatus = pendingStatus[pipelineId];
    if (!nextStatus) {
      return;
    }

    setUpdatingPipelineId(pipelineId);
    setErrorMessage(null);
    try {
      const updated = await api.updatePipelineStatus(pipelineId, nextStatus);
      setPipelines((current) => current.map((item) => (item.id === pipelineId ? updated : item)));
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to update pipeline status.');
      }
    } finally {
      setUpdatingPipelineId(null);
    }
  };

  return (
    <>
      <section className="card">
        <h2>Pipelines</h2>
        <p>Create and operate source-to-target sync pipelines.</p>
        <small>
          Create a new pipeline: <Link href="/pipelines/new">/pipelines/new</Link>
        </small>
      </section>

      {loading ? <section className="card">Loading pipelines...</section> : null}
      {errorMessage ? <section className="card error-card">{errorMessage}</section> : null}
      {runMessage ? <section className="card">{runMessage}</section> : null}

      {!loading && pipelines.length === 0 ? (
        <section className="card">No pipelines yet. Create one to run sync simulations.</section>
      ) : null}

      {!loading && pipelines.length > 0 ? (
        <section className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Source Connector</th>
                <th>Target</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((pipeline) => (
                <tr key={pipeline.id}>
                  <td>
                    <Link href={`/pipelines/${pipeline.id}`}>{pipeline.name}</Link>
                  </td>
                  <td>{connectorNameMap[pipeline.sourceConnectorId] ?? pipeline.sourceConnectorId}</td>
                  <td>{pipeline.targetName}</td>
                  <td>{pipeline.status}</td>
                  <td>{new Date(pipeline.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => void runPipeline(pipeline.id)}
                        disabled={runningPipelineId === pipeline.id}
                      >
                        {runningPipelineId === pipeline.id ? 'Running...' : 'Run'}
                      </button>

                      <select
                        value={pendingStatus[pipeline.id] ?? pipeline.status}
                        onChange={(event) =>
                          setPendingStatus((current) => ({
                            ...current,
                            [pipeline.id]: event.target.value as PipelineStatus,
                          }))
                        }
                      >
                        {PIPELINE_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => void updateStatus(pipeline.id)}
                        disabled={updatingPipelineId === pipeline.id}
                      >
                        {updatingPipelineId === pipeline.id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
