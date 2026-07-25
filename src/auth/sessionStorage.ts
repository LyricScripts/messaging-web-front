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

/**
 * Loads the authenticated session stored in browser session storage.
 *
 * @returns The stored authentication session, or `null` when no valid session is available.
 */
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

/**
 * Persists authentication tokens from a token response.
 *
 * @param response - The authentication token response to persist
 * @returns The normalized stored authentication session
 */
export function saveTokenResponse(response: AuthTokenResponse) {
  return saveStoredSession({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: response.expires_at,
  });
}

/**
 * Persists a refreshed authentication response as the current session.
 *
 * @param response - The refreshed authentication token response
 * @param currentRefreshToken - The refresh token to retain when the response omits one
 * @returns The normalized stored authentication session
 */
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

/**
 * Refreshes the stored authentication session and persists the refreshed tokens.
 *
 * @param authClient - The authentication client used to refresh the session
 * @returns The refreshed and stored authentication session
 */
export async function refreshStoredSession(authClient: AuthClient) {
  const session = requireStoredSession();
  const response = await authClient.refresh({
    refresh_token: session.refreshToken,
  });
  return saveRefreshResponse(response, session.refreshToken);
}

/**
 * Logs out the stored session and clears it from browser storage.
 *
 * @param authClient - Client used to end the remote session
 */
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

/**
 * Normalizes and validates an authentication session.
 *
 * @param session - The session to normalize.
 * @returns A session with trimmed tokens and an optional trimmed expiration time.
 */
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

/**
 * Determines whether a value contains a valid authentication session.
 *
 * @param value - The value to validate
 * @returns `true` if the value has non-empty string access and refresh tokens, `false` otherwise.
 */
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
