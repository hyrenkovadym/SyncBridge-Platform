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
    try {
      await api.runPipeline(pipelineId);
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
                  <td>{pipeline.name}</td>
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
