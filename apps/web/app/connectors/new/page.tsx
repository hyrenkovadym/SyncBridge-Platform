'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { ApiError, api } from '../../../lib/api';
import { ConnectorType } from '../../../lib/types';

const CONNECTOR_TYPES: ConnectorType[] = [
  'REST_API',
  'WEBHOOK',
  'CSV_UPLOAD',
  'JSON_UPLOAD',
  'DATABASE',
  'GOOGLE_SHEETS',
  'ONE_C_EXPORT',
  'MANUAL',
];

const RESTRICTED_KEY_MARKERS = ['password', 'token', 'apikey', 'secret', 'privatekey', 'accesstoken', 'refreshtoken'];

function hasRestrictedKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasRestrictedKeys(item));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (RESTRICTED_KEY_MARKERS.some((marker) => normalizedKey.includes(marker))) {
      return true;
    }

    if (hasRestrictedKeys(nestedValue)) {
      return true;
    }
  }

  return false;
}

export default function NewConnectorPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<ConnectorType>('WEBHOOK');
  const [configJsonText, setConfigJsonText] = useState('{\n  "endpoint": "https://example.local/webhook"\n}');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    let configJson: Record<string, unknown>;
    try {
      const parsed = JSON.parse(configJsonText) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setErrorMessage('configJson must be a valid JSON object.');
        return;
      }

      if (hasRestrictedKeys(parsed)) {
        setErrorMessage(
          'Connector credentials must not be stored in configJson. Use a secret manager in production.',
        );
        return;
      }

      configJson = parsed as Record<string, unknown>;
    } catch {
      setErrorMessage('configJson is not valid JSON.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createConnector({
        name,
        type,
        configJson,
      });
      router.push('/connectors');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to create connector.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card">
      <h2>New Connector</h2>
      <p>Create a connector definition without storing credentials in configuration JSON.</p>

      <form className="stack-form" onSubmit={handleSubmit}>
        <label htmlFor="name">
          Name
          <input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label htmlFor="type">
          Type
          <select id="type" value={type} onChange={(event) => setType(event.target.value as ConnectorType)}>
            {CONNECTOR_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="configJson">
          Config JSON
          <textarea
            id="configJson"
            rows={9}
            value={configJsonText}
            onChange={(event) => setConfigJsonText(event.target.value)}
            required
          />
        </label>

        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Connector'}
        </button>
      </form>

      <small>Policy: no secrets in configJson during Phase 2.</small>
    </section>
  );
}
