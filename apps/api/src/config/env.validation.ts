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
  const normalizedConfig = {
    NODE_ENV: getStringValue('NODE_ENV', config.NODE_ENV, 'development'),
    PORT: getStringValue('PORT', config.PORT, '4100'),
    DATABASE_URL: getStringValue(
      'DATABASE_URL',
      config.DATABASE_URL,
      'postgresql://syncbridge:syncbridge@localhost:5433/syncbridge?schema=public',
    ),
    REDIS_URL: getStringValue('REDIS_URL', config.REDIS_URL, 'redis://localhost:6380'),
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

  return {
    ...config,
    ...normalizedConfig,
  } as Record<string, EnvValue>;
}
