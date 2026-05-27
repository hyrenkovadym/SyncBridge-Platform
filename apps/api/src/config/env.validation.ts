type EnvValue = string;

function getStringValue(key: string, value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (fallback.trim().length > 0) {
    return fallback;
  }

  throw new Error(`Environment variable ${key} is required`);
}

export function validateEnv(config: Record<string, unknown>) {
  const queueModeRaw = getStringValue('QUEUE_MODE', config.QUEUE_MODE, 'sync').toLowerCase();
  if (queueModeRaw !== 'sync' && queueModeRaw !== 'async') {
    throw new Error('Environment variable QUEUE_MODE must be either "sync" or "async"');
  }

  const normalizedConfig = {
    NODE_ENV: getStringValue('NODE_ENV', config.NODE_ENV, 'development'),
    PORT: getStringValue('PORT', config.PORT, '4100'),
    DATABASE_URL: getStringValue(
      'DATABASE_URL',
      config.DATABASE_URL,
      'postgresql://syncbridge:syncbridge@localhost:5433/syncbridge?schema=public',
    ),
    REDIS_URL: getStringValue('REDIS_URL', config.REDIS_URL, 'redis://localhost:6380'),
    QUEUE_MODE: queueModeRaw,
    BULLMQ_REDIS_URL: getStringValue(
      'BULLMQ_REDIS_URL',
      config.BULLMQ_REDIS_URL,
      getStringValue('REDIS_URL', config.REDIS_URL, 'redis://localhost:6380'),
    ),
    BULLMQ_DEFAULT_ATTEMPTS: getStringValue(
      'BULLMQ_DEFAULT_ATTEMPTS',
      config.BULLMQ_DEFAULT_ATTEMPTS,
      '3',
    ),
    BULLMQ_BACKOFF_MS: getStringValue('BULLMQ_BACKOFF_MS', config.BULLMQ_BACKOFF_MS, '5000'),
    SCHEDULER_ENABLED: getStringValue('SCHEDULER_ENABLED', config.SCHEDULER_ENABLED, 'false'),
    SCHEDULER_POLL_INTERVAL_SECONDS: getStringValue(
      'SCHEDULER_POLL_INTERVAL_SECONDS',
      config.SCHEDULER_POLL_INTERVAL_SECONDS,
      '30',
    ),
    SCHEDULER_LOCK_TTL_SECONDS: getStringValue(
      'SCHEDULER_LOCK_TTL_SECONDS',
      config.SCHEDULER_LOCK_TTL_SECONDS,
      '60',
    ),
    JWT_ACCESS_SECRET: getStringValue(
      'JWT_ACCESS_SECRET',
      config.JWT_ACCESS_SECRET,
      'replace_me_access_secret',
    ),
    JWT_REFRESH_SECRET: getStringValue(
      'JWT_REFRESH_SECRET',
      config.JWT_REFRESH_SECRET,
      'replace_me_refresh_secret',
    ),
    CORS_ORIGIN: getStringValue('CORS_ORIGIN', config.CORS_ORIGIN, 'http://localhost:3001'),
  };

  const port = Number(normalizedConfig.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('Environment variable PORT must be a valid positive integer');
  }

  const defaultAttempts = Number(normalizedConfig.BULLMQ_DEFAULT_ATTEMPTS);
  if (!Number.isInteger(defaultAttempts) || defaultAttempts <= 0) {
    throw new Error('Environment variable BULLMQ_DEFAULT_ATTEMPTS must be a valid positive integer');
  }

  const backoffMs = Number(normalizedConfig.BULLMQ_BACKOFF_MS);
  if (!Number.isInteger(backoffMs) || backoffMs < 0) {
    throw new Error('Environment variable BULLMQ_BACKOFF_MS must be a valid non-negative integer');
  }

  const schedulerEnabled = normalizedConfig.SCHEDULER_ENABLED.toLowerCase();
  if (schedulerEnabled !== 'true' && schedulerEnabled !== 'false') {
    throw new Error('Environment variable SCHEDULER_ENABLED must be either "true" or "false"');
  }

  const schedulerPollInterval = Number(normalizedConfig.SCHEDULER_POLL_INTERVAL_SECONDS);
  if (!Number.isInteger(schedulerPollInterval) || schedulerPollInterval <= 0) {
    throw new Error(
      'Environment variable SCHEDULER_POLL_INTERVAL_SECONDS must be a valid positive integer',
    );
  }

  const schedulerLockTtl = Number(normalizedConfig.SCHEDULER_LOCK_TTL_SECONDS);
  if (!Number.isInteger(schedulerLockTtl) || schedulerLockTtl <= 0) {
    throw new Error(
      'Environment variable SCHEDULER_LOCK_TTL_SECONDS must be a valid positive integer',
    );
  }

  return {
    ...config,
    ...normalizedConfig,
    SCHEDULER_ENABLED: schedulerEnabled,
  } as Record<string, EnvValue>;
}
