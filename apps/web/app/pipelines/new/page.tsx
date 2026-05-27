'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { ApiError, api } from '../../../lib/api';
import { Connector } from '../../../lib/types';

export default function NewPipelinePage() {
  const router = useRouter();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loadingConnectors, setLoadingConnectors] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceConnectorId, setSourceConnectorId] = useState('');
  const [targetName, setTargetName] = useState('');
  const [mappingJsonText, setMappingJsonText] = useState('{\n  "email": "contact.email",\n  "name": "contact.name"\n}');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadConnectors = async () => {
      setLoadingConnectors(true);
      setErrorMessage(null);
      try {
        const result = await api.listConnectors();
        setConnectors(result);
        if (result.length > 0) {
          setSourceConnectorId(result[0].id);
        }
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Failed to load connectors.');
        }
      } finally {
        setLoadingConnectors(false);
      }
    };

    void loadConnectors();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!sourceConnectorId) {
      setErrorMessage('Select a source connector first.');
      return;
    }

    let mappingJson: Record<string, unknown>;
    try {
      const parsed = JSON.parse(mappingJsonText) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setErrorMessage('mappingJson must be a valid JSON object.');
        return;
      }
      mappingJson = parsed as Record<string, unknown>;
    } catch {
      setErrorMessage('mappingJson is not valid JSON.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createPipeline({
        name,
        description: description || undefined,
        sourceConnectorId,
        targetName,
        mappingJson,
      });
      router.push('/pipelines');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to create pipeline.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card">
      <h2>New Pipeline</h2>
      <p>Create a pipeline mapped from connector fields into normalized target structure.</p>

      {loadingConnectors ? <p>Loading connectors...</p> : null}

      <form className="stack-form" onSubmit={handleSubmit}>
        <label htmlFor="name">
          Name
          <input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label htmlFor="description">
          Description
          <input
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label htmlFor="sourceConnectorId">
          Source Connector
          <select
            id="sourceConnectorId"
            value={sourceConnectorId}
            onChange={(event) => setSourceConnectorId(event.target.value)}
            required
            disabled={connectors.length === 0}
          >
            {connectors.length === 0 ? <option value="">No connectors available</option> : null}
            {connectors.map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.name} ({connector.type})
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="targetName">
          Target Name
          <input id="targetName" value={targetName} onChange={(event) => setTargetName(event.target.value)} required />
        </label>

        <label htmlFor="mappingJson">
          Mapping JSON
          <textarea
            id="mappingJson"
            rows={9}
            value={mappingJsonText}
            onChange={(event) => setMappingJsonText(event.target.value)}
            required
          />
        </label>

        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

        <button type="submit" disabled={isSubmitting || loadingConnectors || connectors.length === 0}>
          {isSubmitting ? 'Saving...' : 'Save Pipeline'}
        </button>
      </form>
    </section>
  );
}
