'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ApiError, api } from '../../lib/api';
import { Connector, ConnectorStatus } from '../../lib/types';

const STATUS_OPTIONS: ConnectorStatus[] = ['ACTIVE', 'PAUSED', 'ERROR'];

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [pendingStatus, setPendingStatus] = useState<Record<string, ConnectorStatus>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    void loadConnectors();
  }, []);

  const loadConnectors = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await api.listConnectors();
      setConnectors(result);
      setPendingStatus(
        result.reduce<Record<string, ConnectorStatus>>((acc, connector) => {
          acc[connector.id] = connector.status;
          return acc;
        }, {}),
      );
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to load connectors.');
      }
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (connectorId: string) => {
    const nextStatus = pendingStatus[connectorId];
    if (!nextStatus) {
      return;
    }

    setUpdatingId(connectorId);
    setErrorMessage(null);
    try {
      const updated = await api.updateConnectorStatus(connectorId, nextStatus);
      setConnectors((current) => current.map((item) => (item.id === connectorId ? updated : item)));
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to update connector status.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
      <section className="card">
        <h2>Connectors</h2>
        <p>Manage connector definitions and operational status.</p>
        <small>
          Create a new connector: <Link href="/connectors/new">/connectors/new</Link>
        </small>
      </section>

      {loading ? <section className="card">Loading connectors...</section> : null}
      {errorMessage ? <section className="card error-card">{errorMessage}</section> : null}

      {!loading && connectors.length === 0 ? (
        <section className="card">No connectors yet. Create one to start wiring pipelines.</section>
      ) : null}

      {!loading && connectors.length > 0 ? (
        <section className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((connector) => (
                <tr key={connector.id}>
                  <td>{connector.name}</td>
                  <td>{connector.type}</td>
                  <td>{connector.status}</td>
                  <td>{new Date(connector.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <select
                        value={pendingStatus[connector.id] ?? connector.status}
                        onChange={(event) =>
                          setPendingStatus((current) => ({
                            ...current,
                            [connector.id]: event.target.value as ConnectorStatus,
                          }))
                        }
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void updateStatus(connector.id)}
                        disabled={updatingId === connector.id}
                      >
                        {updatingId === connector.id ? 'Saving...' : 'Update'}
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
