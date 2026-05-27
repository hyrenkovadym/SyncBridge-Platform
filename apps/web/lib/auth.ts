import { AuthUser } from './types';

const SESSION_STORAGE_KEY = 'syncbridge_session_v1';

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser | null;
};

export function isBrowser() {
  return typeof window !== 'undefined';
}

export function getStoredSession(): AuthSession | null {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.accessToken || !parsed?.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthSession) {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getAccessToken() {
  return getStoredSession()?.accessToken ?? null;
}

export function getRefreshToken() {
  return getStoredSession()?.refreshToken ?? null;
}

export function updateStoredTokens(accessToken: string, refreshToken: string) {
  const current = getStoredSession();
  setStoredSession({
    accessToken,
    refreshToken,
    user: current?.user ?? null,
  });
}
