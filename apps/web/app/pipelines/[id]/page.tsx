'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ApiError, api } from '../../../lib/api';
import { SyncPipeline, TransformationPreviewResponse } from '../../../lib/types';

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

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default function PipelineDetailPage() {
  const params = useParams<{ id: string }>();
  const pipelineId = params.id;

  const [pipeline, setPipeline] = useState<SyncPipeline | null>(null);
  const [mappingJsonText, setMappingJsonText] = useState('');
  const [sampleRawText, setSampleRawText] = useState(DEFAULT_SAMPLE_RAW);
  const [previewResponse, setPreviewResponse] = useState<TransformationPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const result = await api.getPipeline(pipelineId);
        setPipeline(result);
        setMappingJsonText(formatJson(result.mappingJson));
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Failed to load pipeline details.');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [pipelineId]);

  const canPreview = useMemo(() => !!pipeline && !loading, [pipeline, loading]);

  const runPreview = async () => {
    if (!pipeline) {
      return;
    }

    setErrorMessage(null);
    setPreviewResponse(null);

    let rawRecord: Record<string, unknown>;

    try {
      const parsedRaw = JSON.parse(sampleRawText) as unknown;
      if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
        setErrorMessage('Sample raw record must be a valid JSON object.');
        return;
      }
      rawRecord = parsedRaw as Record<string, unknown>;
    } catch {
      setErrorMessage('Invalid JSON in sample raw record.');
      return;
    }

    setIsPreviewing(true);
    try {
      const result = await api.previewPipelineTransformation(pipeline.id, {
        records: [{ externalId: 'preview-1', raw: rawRecord }],
      });
      setPreviewResponse(result);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to preview transformation.');
      }
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <section className="card">
      <h2>Pipeline Transformation Preview</h2>

      {loading ? <p>Loading pipeline...</p> : null}
      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

      {pipeline ? (
        <>
          <p>
            <strong>{pipeline.name}</strong> ({pipeline.status}) - target: {pipeline.targetName}
          </p>

          <label htmlFor="mappingJson">
            Mapping JSON (read-only for preview against saved pipeline)
            <textarea
              id="mappingJson"
              rows={14}
              value={mappingJsonText}
              readOnly
            />
          </label>

          <label htmlFor="sampleRaw">
            Sample Raw Record
            <textarea
              id="sampleRaw"
              rows={12}
              value={sampleRawText}
              onChange={(event) => setSampleRawText(event.target.value)}
            />
          </label>

          <button type="button" onClick={() => void runPreview()} disabled={!canPreview || isPreviewing}>
            {isPreviewing ? 'Previewing...' : 'Preview Transformation'}
          </button>

          {previewResponse ? (
            <div className="preview-output">
              <h3>Preview Summary</h3>
              <p>
                Received: {previewResponse.summary.recordsReceived} | Valid: {previewResponse.summary.recordsValid} |
                Invalid: {previewResponse.summary.recordsInvalid}
              </p>

              {previewResponse.results.map((result, index) => (
                <div className="card" key={`${result.externalId ?? 'record'}-${index}`}>
                  <h3>Record {index + 1}</h3>
                  <p>External ID: {result.externalId ?? '-'}</p>
                  <pre className="helper-block">{formatJson(result.normalized)}</pre>
                  {result.errors.length > 0 ? (
                    <ul className="simple-list">
                      {result.errors.map((error, errorIndex) => (
                        <li key={`${error.code}-${error.field}-${errorIndex}`}>
                          {error.field}: {error.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No transformation errors.</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
