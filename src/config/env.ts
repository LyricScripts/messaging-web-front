export type AppConfig = {
  apiBaseUrl: string;
  wsBaseUrl: string;
};

export const defaultConfig: AppConfig = {
  apiBaseUrl: "http://localhost:8080",
  wsBaseUrl: "ws://localhost:8080/ws",
};

/**
 * Loads application configuration from Vite environment variables.
 *
 * @param env - The environment values used to configure the application
 * @returns The normalized API and WebSocket base URLs
 */
export function loadAppConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(env.VITE_API_BASE_URL, defaultConfig.apiBaseUrl),
    wsBaseUrl: normalizeBaseUrl(env.VITE_WS_BASE_URL, defaultConfig.wsBaseUrl),
  };
}

/**
 * Normalizes a base URL for use in application configuration.
 *
 * @param value - The URL value to trim and normalize
 * @param fallback - The value to use when `value` is missing or blank
 * @returns The trimmed URL without one trailing slash, or `fallback` when `value` is missing or blank
 */
function normalizeBaseUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/\/$/, "");
}
