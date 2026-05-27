export type UserRole = 'USER' | 'OPERATOR' | 'ADMIN';

export type ConnectorType =
  | 'REST_API'
  | 'WEBHOOK'
  | 'CSV_UPLOAD'
  | 'JSON_UPLOAD'
  | 'DATABASE'
  | 'GOOGLE_SHEETS'
  | 'ONE_C_EXPORT'
  | 'MANUAL';

export type ConnectorStatus = 'ACTIVE' | 'PAUSED' | 'ERROR';
export type PipelineStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type SyncRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type WebhookEventStatus = 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'IGNORED';
export type BackgroundJobType = 'SYNC_RUN' | 'WEBHOOK_PROCESSING';
export type BackgroundJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ApiErrorPayload {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
}

export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  status: ConnectorStatus;
  configJson: Record<string, unknown>;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncPipeline {
  id: string;
  name: string;
  description: string | null;
  sourceConnectorId: string;
  targetName: string;
  status: PipelineStatus;
  mappingJson: Record<string, unknown>;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  pipelineId: string;
  status: SyncRunStatus;
  recordsReceived: number;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  pipeline?: {
    id: string;
    name: string;
    ownerId?: string;
    targetName?: string;
  } | null;
  summary?: {
    recordsReceived: number;
    recordsProcessed: number;
    recordsFailed: number;
  };
}

export interface AsyncRunQueuedResponse {
  jobId: string;
  syncRunId: string;
  pipelineId: string;
  status: 'QUEUED';
  message: string;
}

export interface BackgroundJob {
  id: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  entityType: string;
  entityId: string;
  attempts: number;
  lastError: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface WebhookEvent {
  id: string;
  sourceConnectorRef: string;
  connectorId: string | null;
  idempotencyKey: string | null;
  eventType: string;
  status: WebhookEventStatus;
  payloadJson: Record<string, unknown>;
  headersJson: Record<string, unknown> | null;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  connector?: {
    id: string;
    name: string;
    ownerId?: string;
  } | null;
}

export interface WebhookEventActionResponse {
  eventId: string;
  id: string;
  status: WebhookEventStatus;
  duplicate?: boolean;
  jobId?: string | null;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface DashboardSummary {
  connectorsCount: number;
  pipelinesCount: number;
  syncRunsCount: number;
  webhookEventsCount: number;
  failedRunsCount: number;
  latestRuns: SyncRun[];
  latestWebhookEvents: WebhookEvent[];
}

export interface TransformationPreviewError {
  field: string;
  code: string;
  message: string;
  path?: string;
}

export interface TransformationPreviewResult {
  externalId?: string;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  errors: TransformationPreviewError[];
}

export interface TransformationPreviewResponse {
  pipelineId: string;
  results: TransformationPreviewResult[];
  summary: {
    recordsReceived: number;
    recordsValid: number;
    recordsInvalid: number;
  };
}

export interface MappingValidationResponse {
  valid: boolean;
  errors: string[];
}
