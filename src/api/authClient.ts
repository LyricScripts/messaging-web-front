import type { AppConfig } from "../config/env";

export type RegisterRequest = {
  email: string;
  password: string;
  display_name?: string;
  avatar_url?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RefreshRequest = {
  refresh_token: string;
};

export type LogoutRequest = {
  refresh_token?: string;
};

export type VerifyEmailRequest = {
  email: string;
  code: string;
};

export type ResendVerificationRequest = {
  email: string;
};

export type AuthUserResponse = {
  user_id: string;
  auth_identity_id?: string;
  tenant_id?: string;
  email?: string;
  username?: string;
  display_name: string;
  avatar_url?: string | null;
  role?: string;
  created_at?: string;
  updated_at?: string;
};

export type AuthTokenResponse = {
  authenticated?: boolean;
  user_id?: string;
  auth_identity_id?: string;
  tenant_id?: string;
  email?: string;
  display_name?: string;
  avatar_url?: string | null;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
  user?: AuthUserResponse;
};

export type RegisterResponse = {
  user_id: string;
  auth_identity_id: string;
  tenant_id: string;
  email: string;
  display_name?: string;
  avatar_url?: string | null;
  message: string;
};
export type LoginResponse = AuthTokenResponse;
export type VerifyEmailResponse = AuthTokenResponse;
export type ResendVerificationResponse = {
  message: string;
};
export type RefreshResponse = Pick<
  AuthTokenResponse,
  "access_token" | "token_type" | "expires_at"
> & {
  refresh_token?: string;
};
export type MeResponse = AuthUserResponse;

export type AuthClient = {
  config: AppConfig;
  register: (request: RegisterRequest) => Promise<RegisterResponse>;
  login: (request: LoginRequest) => Promise<LoginResponse>;
  verifyEmail: (request: VerifyEmailRequest) => Promise<VerifyEmailResponse>;
  resendVerification: (
    request: ResendVerificationRequest,
  ) => Promise<ResendVerificationResponse>;
  refresh: (request: RefreshRequest) => Promise<RefreshResponse>;
  logout: (request: LogoutRequest) => Promise<void>;
  getMe: (accessToken: string) => Promise<MeResponse>;
};

export class AuthApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
  }
}

type AuthRequestOptions = {
  accessToken?: string;
  body?: unknown;
  method?: "GET" | "POST";
};

/**
 * Creates an authentication client configured for the specified application.
 *
 * @param config - Application configuration used for authentication requests
 * @returns An authentication client exposing registration, login, token, verification, logout, and user operations
 */
export function createAuthClient(config: AppConfig): AuthClient {
  return {
    config,
    register: (request) =>
      requestJson<RegisterResponse>(config.apiBaseUrl, "/auth/register", {
        body: request,
        method: "POST",
      }),
    login: (request) =>
      requestJson<LoginResponse>(config.apiBaseUrl, "/auth/login", {
        body: request,
        method: "POST",
      }),
    verifyEmail: (request) =>
      requestJson<VerifyEmailResponse>(
        config.apiBaseUrl,
        "/auth/verify-email",
        {
          body: request,
          method: "POST",
        },
      ),
    resendVerification: (request) =>
      requestJson<ResendVerificationResponse>(
        config.apiBaseUrl,
        "/auth/resend-verification",
        {
          body: request,
          method: "POST",
        },
      ),
    refresh: (request) =>
      requestJson<RefreshResponse>(config.apiBaseUrl, "/auth/refresh", {
        body: request,
        method: "POST",
      }),
    logout: (request) =>
      requestNoContent(config.apiBaseUrl, "/auth/logout", {
        body: request,
        method: "POST",
      }),
    getMe: (accessToken) =>
      requestJson<MeResponse>(config.apiBaseUrl, "/auth/me", { accessToken }),
  };
}

async function requestJson<T>(
  apiBaseUrl: string,
  path: string,
  options: AuthRequestOptions = {},
) {
  const response = await request(apiBaseUrl, path, options);
  return response.json() as Promise<T>;
}

async function requestNoContent(
  apiBaseUrl: string,
  path: string,
  options: AuthRequestOptions,
) {
  await request(apiBaseUrl, path, options);
}

async function request(
  apiBaseUrl: string,
  path: string,
  options: AuthRequestOptions,
) {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: buildHeaders(options),
      method: options.method ?? "GET",
    });
  } catch {
    throw new AuthApiError(
      "Unable to reach the authentication service.",
      0,
      "network_error",
    );
  }

  if (!response.ok) {
    throw await normalizeAuthError(response);
  }

  return response;
}

function buildHeaders(options: AuthRequestOptions) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.accessToken?.trim()) {
    headers.Authorization = `Bearer ${options.accessToken.trim()}`;
  }
  return headers;
}

/**
 * Normalizes an unsuccessful authentication response into an `AuthApiError`.
 *
 * @param response - The HTTP response containing authentication error details
 * @returns An authentication error with a status, message, and optional error code
 */
export async function normalizeAuthError(response: Response) {
  const fallback = authStatusMessage(response.status);
  const payload = await response.json().catch(() => undefined);

  if (!isRecord(payload)) {
    return new AuthApiError(fallback, response.status);
  }

  const code = typeof payload.code === "string" ? payload.code : undefined;
  const error = typeof payload.error === "string" ? payload.error : undefined;
  const message = shouldUseNeutralAuthMessage(response.status)
    ? fallback
    : extractErrorMessage(payload) ?? fallback;
  return new AuthApiError(message, response.status, code ?? error);
}

/**
 * Extracts a user-facing error message from a normalized authentication error payload.
 *
 * @param payload - The error payload containing message details.
 * @returns The first available trimmed message, joined detail messages, or `undefined` when no message is available.
 */
function extractErrorMessage(payload: Record<string, unknown>) {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail.trim();
  }
  if (Array.isArray(payload.detail)) {
    const messages = payload.detail
      .map((item) =>
        isRecord(item) && typeof item.msg === "string" ? item.msg.trim() : "",
      )
      .filter(Boolean);
    return messages.length ? messages.join("; ") : undefined;
  }
  return undefined;
}

/**
 * Provides a user-facing message for an authentication HTTP status.
 *
 * @param status - The HTTP status code returned by the authentication service
 * @returns The corresponding authentication error message
 */
function authStatusMessage(status: number) {
  if (status === 400) return "The authentication request was not accepted.";
  if (status === 401) return "The email, password, or session is invalid.";
  if (status === 403) return "We could not complete that authentication step.";
  if (status === 409) return "We could not complete registration for this email.";
  if (status === 422) return "Check the submitted account details.";
  if (status >= 500) return "Authentication is temporarily unavailable.";
  return "The authentication request failed.";
}

/**
 * Determines whether an authentication error should use a neutral message.
 *
 * @param status - The HTTP status code.
 * @returns `true` if the status is 401, 403, or 409, `false` otherwise.
 */
function shouldUseNeutralAuthMessage(status: number) {
  return status === 401 || status === 403 || status === 409;
}

/**
 * Determines whether a value is a non-null object record.
 *
 * @param value - The value to check
 * @returns `true` if the value is a non-null object, `false` otherwise.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
