import {
  clearStoredSession,
  getAccessToken,
  getRefreshToken,
  getStoredSession,
  setStoredSession,
  updateStoredTokens,
} from './auth';
import {
  AuthResponse,
  Connector,
  ConnectorStatus,
  ConnectorType,
  DashboardSummary,
  PaginatedResponse,
  SyncPipeline,
  SyncRun,
  SyncRunStatus,
  TokenPairResponse,
  WebhookEvent,
} from './types';

const DEFAULT_API_BASE_URL = 'http://localhost:4100/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  authenticated?: boolean;
  retry?: boolean;
};

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
}

function buildHeaders(accessToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }
  } catch {
    return `Request failed with status ${response.status}`;
  }

  return `Request failed with status ${response.status}`;
}

async function performTokenRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearStoredSession();
    return false;
  }

  const tokenPair = (await response.json()) as TokenPairResponse;
  updateStoredTokens(tokenPair.accessToken, tokenPair.refreshToken);
  return true;
}

async function requestApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const authenticated = options.authenticated ?? true;
  const retry = options.retry ?? true;
  const accessToken = authenticated ? getAccessToken() ?? undefined : undefined;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: buildHeaders(accessToken),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && authenticated && retry) {
    const refreshed = await performTokenRefresh();
    if (refreshed) {
      return requestApi<T>(path, {
        ...options,
        retry: false,
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  return (await response.json()) as T;
}

export const api = {
  async register(payload: { email: string; password: string; fullName: string }) {
    const result = await requestApi<AuthResponse>('/auth/register', {
      method: 'POST',
      body: payload,
      authenticated: false,
    });
    setStoredSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    return result;
  },

  async login(payload: { email: string; password: string }) {
    const result = await requestApi<AuthResponse>('/auth/login', {
      method: 'POST',
      body: payload,
      authenticated: false,
    });
    setStoredSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    return result;
  },

  async me() {
    const user = await requestApi<AuthResponse['user']>('/auth/me');
    const current = getStoredSession();
    if (current) {
      setStoredSession({
        ...current,
        user,
      });
    }
    return user;
  },

  async logout() {
    const session = getStoredSession();
    if (session) {
      try {
        await requestApi<{ success: boolean }>('/auth/logout', {
          method: 'POST',
          body: {
            refreshToken: session.refreshToken,
          },
        });
      } catch {
        // Local session clear is enough for demo mode even if server-side revoke fails.
      }
    }
    clearStoredSession();
  },

  async listConnectors() {
    return requestApi<Connector[]>('/connectors');
  },

  async createConnector(payload: {
    name: string;
    type: ConnectorType;
    configJson: Record<string, unknown>;
  }) {
    return requestApi<Connector>('/connectors', {
      method: 'POST',
      body: payload,
    });
  },

  async updateConnectorStatus(connectorId: string, status: ConnectorStatus) {
    return requestApi<Connector>(`/connectors/${connectorId}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },

  async listPipelines() {
    return requestApi<SyncPipeline[]>('/pipelines');
  },

  async createPipeline(payload: {
    name: string;
    description?: string;
    sourceConnectorId: string;
    targetName: string;
    mappingJson: Record<string, unknown>;
  }) {
    return requestApi<SyncPipeline>('/pipelines', {
      method: 'POST',
      body: payload,
    });
  },

  async updatePipelineStatus(pipelineId: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    return requestApi<SyncPipeline>(`/pipelines/${pipelineId}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },

  async runPipeline(
    pipelineId: string,
    payload?: {
      mockRecords?: Array<{ externalId?: string; raw: Record<string, unknown> }>;
    },
  ) {
    return requestApi<SyncRun>(`/pipelines/${pipelineId}/runs`, {
      method: 'POST',
      body: payload ?? {},
    });
  },

  async listPipelineRuns(pipelineId: string) {
    return requestApi<SyncRun[]>(`/pipelines/${pipelineId}/runs`);
  },

  async listSyncRuns(query?: { page?: number; limit?: number; status?: SyncRunStatus }) {
    const search = new URLSearchParams();
    if (query?.page) {
      search.set('page', String(query.page));
    }
    if (query?.limit) {
      search.set('limit', String(query.limit));
    }
    if (query?.status) {
      search.set('status', query.status);
    }
    const querySuffix = search.size > 0 ? `?${search.toString()}` : '';
    return requestApi<PaginatedResponse<SyncRun>>(`/sync-runs${querySuffix}`);
  },

  async listWebhookEvents(query?: { page?: number; limit?: number }) {
    const search = new URLSearchParams();
    if (query?.page) {
      search.set('page', String(query.page));
    }
    if (query?.limit) {
      search.set('limit', String(query.limit));
    }
    const querySuffix = search.size > 0 ? `?${search.toString()}` : '';
    return requestApi<PaginatedResponse<WebhookEvent>>(`/webhooks/events${querySuffix}`);
  },

  async getWebhookEvent(id: string) {
    return requestApi<WebhookEvent>(`/webhooks/events/${id}`);
  },

  async getDashboardSummary() {
    return requestApi<DashboardSummary>('/dashboard/summary');
  },
};
