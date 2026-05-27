const FORBIDDEN_CONFIG_KEY_MARKERS = new Set([
  'password',
  'token',
  'apikey',
  'secret',
  'privatekey',
  'accesstoken',
  'refreshtoken',
]);

export const CONNECTOR_SECRET_POLICY_ERROR =
  'Connector credentials must not be stored in configJson. Use a secret manager in production.';

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hasForbiddenConfigKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenConfigKeys(item));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    for (const marker of FORBIDDEN_CONFIG_KEY_MARKERS) {
      if (normalized.includes(marker)) {
        return true;
      }
    }

    if (hasForbiddenConfigKeys(nestedValue)) {
      return true;
    }
  }

  return false;
}
