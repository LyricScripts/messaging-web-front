import type {
  AuthClient,
  AuthTokenResponse,
  RefreshResponse,
} from "../api/authClient";

const sessionStorageKey = "messaging-web-front:auth-session";

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
};

export function loadStoredSession(): AuthSession | null {
  try {
    const storedValue = window.sessionStorage.getItem(sessionStorageKey);
    if (!storedValue) {
      return null;
    }

    const session = JSON.parse(storedValue) as unknown;
    if (!isAuthSession(session)) {
      clearStoredSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function loadStoredAccessToken() {
  return loadStoredSession()?.accessToken ?? "";
}

export function saveStoredSession(session: AuthSession) {
  const normalizedSession = normalizeSession(session);
  try {
    window.sessionStorage.setItem(
      sessionStorageKey,
      JSON.stringify(normalizedSession),
    );
  } catch {
    throw new Error("The browser could not store the messaging session.");
  }
  return normalizedSession;
}

export function saveTokenResponse(response: AuthTokenResponse) {
  return saveStoredSession({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: response.expires_at,
  });
}

export function saveRefreshResponse(
  response: RefreshResponse,
  currentRefreshToken: string,
) {
  return saveStoredSession({
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? currentRefreshToken,
    expiresAt: response.expires_at,
  });
}

export function clearStoredSession() {
  try {
    window.sessionStorage.removeItem(sessionStorageKey);
  } catch {
    // An unavailable storage provider is equivalent to an empty session.
  }
}

export async function refreshStoredSession(authClient: AuthClient) {
  const session = requireStoredSession();
  const response = await authClient.refresh({
    refresh_token: session.refreshToken,
  });
  return saveRefreshResponse(response, session.refreshToken);
}

export async function logoutAndClearSession(authClient: AuthClient) {
  const session = loadStoredSession();
  try {
    if (session) {
      await authClient.logout({
        refresh_token: session.refreshToken,
      });
    }
  } finally {
    clearStoredSession();
  }
}

function requireStoredSession() {
  const session = loadStoredSession();
  if (!session) {
    throw new Error("No messaging session is available.");
  }
  return session;
}

function normalizeSession(session: AuthSession): AuthSession {
  const accessToken = session.accessToken.trim();
  const refreshToken = session.refreshToken.trim();
  if (!accessToken || !refreshToken) {
    throw new Error("A complete messaging session is required.");
  }
  const expiresAt = session.expiresAt?.trim();
  return expiresAt
    ? { accessToken, refreshToken, expiresAt }
    : { accessToken, refreshToken };
}

function isAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const session = value as Record<string, unknown>;
  return (
    typeof session.accessToken === "string" &&
    Boolean(session.accessToken.trim()) &&
    typeof session.refreshToken === "string" &&
    Boolean(session.refreshToken.trim())
  );
}
