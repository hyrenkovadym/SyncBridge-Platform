'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { ApiError, api } from '../../../lib/api';
import { Connector } from '../../../lib/types';

const DEFAULT_MAPPING = `{
  "fields": {
    "email": { "path": "contact.email", "required": true, "type": "string", "trim": true, "lowercase": true },
    "fullName": { "path": "contact.name", "default": "Unknown", "type": "string", "trim": true },
    "amount": { "path": "invoice.total", "type": "number" },
    "isActive": { "path": "active", "type": "boolean", "default": true },
    "ingestedAt": { "path": "meta.any", "type": "date", "compute": "now" }
  }
}`;

const DEFAULT_SAMPLE_RAW = `{
  "contact": {
    "email": "  USER@EXAMPLE.COM  ",
    "name": " Test User "
  },
  "invoice": {
    "total": "42.50"
  },
  "active": "true"
}`;

export default function NewPipelinePage() {
  const router = useRouter();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loadingConnectors, setLoadingConnectors] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceConnectorId, setSourceConnectorId] = useState('');
  const [targetName, setTargetName] = useState('');
  const [mappingJsonText, setMappingJsonText] = useState(DEFAULT_MAPPING);
  const [sampleRawText, setSampleRawText] = useState(DEFAULT_SAMPLE_RAW);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mappingValidation, setMappingValidation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingMapping, setIsValidatingMapping] = useState(false);

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

  const parseMappingJson = () => {
    const parsed = JSON.parse(mappingJsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('mappingJson must be a valid JSON object.');
    }
    return parsed as Record<string, unknown>;
  };

  const validateMapping = async () => {
    setErrorMessage(null);
    setMappingValidation(null);

    let mappingJson: Record<string, unknown>;
    try {
      mappingJson = parseMappingJson();
      const sampleRaw = JSON.parse(sampleRawText) as unknown;
      if (!sampleRaw || typeof sampleRaw !== 'object' || Array.isArray(sampleRaw)) {
        throw new Error('Sample raw record must be a valid JSON object.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Invalid JSON input.');
      return;
    }

    setIsValidatingMapping(true);
    try {
      const result = await api.validateMapping(mappingJson);
      if (result.valid) {
        setMappingValidation('Mapping is valid. Save the pipeline, then open detail page to run transformation preview.');
      } else {
        setMappingValidation(`Mapping errors: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to validate mapping.');
      }
    } finally {
      setIsValidatingMapping(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setMappingValidation(null);

    if (!sourceConnectorId) {
      setErrorMessage('Select a source connector first.');
      return;
    }

    let mappingJson: Record<string, unknown>;
    try {
      mappingJson = parseMappingJson();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Invalid mapping JSON.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createPipeline({
        name,
        description: description || undefined,
        sourceConnectorId,
        targetName,
        mappingJson,
      });
      router.push(`/pipelines/${created.id}`);
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
      <p>Create a pipeline and validate mapping config before previewing transformations.</p>

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
            rows={14}
            value={mappingJsonText}
            onChange={(event) => setMappingJsonText(event.target.value)}
            required
          />
        </label>

        <label htmlFor="sampleRaw">
          Sample Raw Record (for pre-save validation)
          <textarea
            id="sampleRaw"
            rows={10}
            value={sampleRawText}
            onChange={(event) => setSampleRawText(event.target.value)}
          />
        </label>

        <div className="row-actions">
          <button type="button" onClick={() => void validateMapping()} disabled={isValidatingMapping}>
            {isValidatingMapping ? 'Validating...' : 'Preview Transformation'}
          </button>
          <button type="submit" disabled={isSubmitting || loadingConnectors || connectors.length === 0}>
            {isSubmitting ? 'Saving...' : 'Save Pipeline'}
          </button>
        </div>

        {mappingValidation ? <p>{mappingValidation}</p> : null}
        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
      </form>
    </section>
  );
}
