export const DANGEROUS_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function splitPath(path: string) {
  return path
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function assertSafePath(path: string) {
  const segments = splitPath(path);
  if (segments.length === 0) {
    throw new Error('Path must contain at least one segment');
  }

  for (const segment of segments) {
    if (DANGEROUS_PATH_KEYS.has(segment)) {
      throw new Error(`Path contains unsafe segment: ${segment}`);
    }
  }

  return segments;
}

export function getByPath(source: Record<string, unknown>, path: string): unknown {
  const segments = assertSafePath(path);

  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function setByPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = assertSafePath(path);

  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const existing = current[segment];

    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = value;
}
