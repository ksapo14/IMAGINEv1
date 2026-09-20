/**
 * Resolves the optional local API origin for browser and server rendering.
 * Frontend-only deployment checks remain the responsibility of each feature.
 */
export function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  const apiPort = process.env.NEXT_PUBLIC_API_PORT?.trim() || "8010";
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
  }
  return `http://127.0.0.1:${apiPort}`;
}

/** Backward-compatible shared API origin used by existing generation clients. */
export const API_BASE_URL = getApiBaseUrl();
