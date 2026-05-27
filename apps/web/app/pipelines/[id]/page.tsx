'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ApiError, api } from '../../../lib/api';
import {
  PipelineSchedule,
  SchedulerStatus,
  SyncPipeline,
  TransformationPreviewResponse,
} from '../../../lib/types';

const DEFAULT_SAMPLE_RAW = `{
  "contact": {
    "email": "  USER@EXAMPLE.COM  ",
    "name": " Test User "
  },
  "invoice": {
    "total": "42.50"
  },
  "active": "true",
  "sequence": 1,
  "updatedAt": "2026-01-01T00:00:00.000Z"
}`;

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default function PipelineDetailPage() {
  const params = useParams<{ id: string }>();
  const pipelineId = params.id;

  const [pipeline, setPipeline] = useState<SyncPipeline | null>(null);
  const [schedule, setSchedule] = useState<PipelineSchedule | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [mappingJsonText, setMappingJsonText] = useState('');
  const [sampleRawText, setSampleRawText] = useState(DEFAULT_SAMPLE_RAW);
  const [previewResponse, setPreviewResponse] = useState<TransformationPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [ignoreCursor, setIgnoreCursor] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('*/5 * * * *');
  const [scheduleTimezone, setScheduleTimezone] = useState('UTC');
  const [incrementalMode, setIncrementalMode] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const [pipelineResult, scheduleResult, schedulerStatusResult] = await Promise.all([
          api.getPipeline(pipelineId),
          api.getPipelineSchedule(pipelineId),
          api.getSchedulerStatus(),
        ]);

        setPipeline(pipelineResult);
        setMappingJsonText(formatJson(pipelineResult.mappingJson));
        setSchedule(scheduleResult);
        setSchedulerStatus(schedulerStatusResult);
        setScheduleEnabled(scheduleResult.scheduleEnabled);
        setScheduleCron(scheduleResult.scheduleCron ?? '*/5 * * * *');
        setScheduleTimezone(scheduleResult.scheduleTimezone ?? 'UTC');
        setIncrementalMode(scheduleResult.incrementalMode);
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

  const runPipeline = async () => {
    if (!pipeline) {
      return;
    }

    setIsRunning(true);
    setRunMessage(null);
    setErrorMessage(null);

    try {
      const result = await api.runPipeline(pipeline.id, {
        ignoreCursor,
      });
      if ('jobId' in result) {
        setRunMessage(`Run queued (job ${result.jobId}). Waiting for completion...`);
        await pollJobUntilFinished(result.jobId);
      } else {
        setRunMessage(`Run finished with status ${result.status}.`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to run pipeline.');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const triggerScheduledRun = async () => {
    if (!pipeline) {
      return;
    }

    setIsRunning(true);
    setRunMessage(null);
    setErrorMessage(null);

    try {
      const result = await api.triggerPipelineSchedule(pipeline.id);
      if ('jobId' in result) {
        setRunMessage(`Scheduled run queued (job ${result.jobId}). Waiting for completion...`);
        await pollJobUntilFinished(result.jobId);
      } else {
        setRunMessage(`Scheduled run finished with status ${result.status}.`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to trigger scheduled run.');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const saveSchedule = async () => {
    if (!pipeline) {
      return;
    }

    setIsSavingSchedule(true);
    setScheduleMessage(null);
    setErrorMessage(null);
    try {
      const updated = await api.updatePipelineSchedule(pipeline.id, {
        scheduleEnabled,
        scheduleCron,
        scheduleTimezone,
        incrementalMode,
      });
      setSchedule(updated);
      setScheduleMessage('Schedule saved.');
      const latestSchedulerStatus = await api.getSchedulerStatus();
      setSchedulerStatus(latestSchedulerStatus);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to save schedule.');
      }
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const pollJobUntilFinished = async (jobId: string, attempt = 0): Promise<void> => {
    if (attempt > 60) {
      setRunMessage(`Job ${jobId} is still running. Check /sync-runs for latest state.`);
      return;
    }

    const job = await api.getJob(jobId);
    if (job.status === 'COMPLETED') {
      setRunMessage(`Job ${jobId} completed.`);
      const refreshedSchedule = await api.getPipelineSchedule(pipelineId);
      setSchedule(refreshedSchedule);
      return;
    }
    if (job.status === 'FAILED') {
      setRunMessage(`Job ${jobId} failed.`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await pollJobUntilFinished(jobId, attempt + 1);
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

          {schedulerStatus ? (
            <p>
              Scheduler: {schedulerStatus.schedulerEnabled ? 'enabled' : 'disabled'} (
              {schedulerStatus.processRole})
            </p>
          ) : null}

          <div className="card">
            <h3>Schedule</h3>
            <label htmlFor="scheduleEnabled">
              <input
                id="scheduleEnabled"
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(event) => setScheduleEnabled(event.target.checked)}
              />
              Enable schedule
            </label>

            <label htmlFor="scheduleCron">
              Cron
              <input
                id="scheduleCron"
                value={scheduleCron}
                onChange={(event) => setScheduleCron(event.target.value)}
              />
            </label>

            <label htmlFor="scheduleTimezone">
              Timezone
              <input
                id="scheduleTimezone"
                value={scheduleTimezone}
                onChange={(event) => setScheduleTimezone(event.target.value)}
              />
            </label>

            <label htmlFor="incrementalMode">
              <input
                id="incrementalMode"
                type="checkbox"
                checked={incrementalMode}
                onChange={(event) => setIncrementalMode(event.target.checked)}
              />
              Incremental mode
            </label>

            <div className="row-actions">
              <button type="button" onClick={() => void saveSchedule()} disabled={isSavingSchedule}>
                {isSavingSchedule ? 'Saving...' : 'Save Schedule'}
              </button>
              <button type="button" onClick={() => void triggerScheduledRun()} disabled={isRunning}>
                {isRunning ? 'Triggering...' : 'Trigger Scheduled Run'}
              </button>
            </div>

            {schedule ? (
              <p>
                Next run: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : '-'} | Last
                run: {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : '-'}
              </p>
            ) : null}

            {schedule?.cursorSummary ? (
              <pre className="helper-block">{formatJson(schedule.cursorSummary)}</pre>
            ) : (
              <p>Cursor summary: none</p>
            )}

            {scheduleMessage ? <p>{scheduleMessage}</p> : null}
          </div>

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

          <label htmlFor="ignoreCursor">
            <input
              id="ignoreCursor"
              type="checkbox"
              checked={ignoreCursor}
              onChange={(event) => setIgnoreCursor(event.target.checked)}
            />
            Ignore cursor for manual run
          </label>

          <button type="button" onClick={() => void runPreview()} disabled={!canPreview || isPreviewing}>
            {isPreviewing ? 'Previewing...' : 'Preview Transformation'}
          </button>

          <button type="button" onClick={() => void runPipeline()} disabled={isRunning}>
            {isRunning ? 'Queueing...' : 'Run Pipeline'}
          </button>

          {runMessage ? <p>{runMessage}</p> : null}

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
