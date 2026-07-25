export type AppConfig = {
  apiBaseUrl: string;
  wsBaseUrl: string;
};

export const defaultConfig: AppConfig = {
  apiBaseUrl: "http://localhost:8080",
  wsBaseUrl: "ws://localhost:8080/ws",
};

export function loadAppConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(env.VITE_API_BASE_URL, defaultConfig.apiBaseUrl),
    wsBaseUrl: normalizeBaseUrl(env.VITE_WS_BASE_URL, defaultConfig.wsBaseUrl),
  };
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/\/$/, "");
}
