export const REQUEST_ID_HEADER = 'x-request-id';

export const REQUEST_CONTEXT_SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'password',
  'token',
  'apikey',
  'secret',
  'privatekey',
  'accesstoken',
  'refreshtoken',
]);
