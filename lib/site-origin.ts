const DEFAULT_SITE_ORIGIN = "http://localhost:3000";

export function getSiteOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredOrigin) return configuredOrigin.replace(/\/+$/, "");

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return `https://${productionHost.replace(/^https?:\/\//, "")}`.replace(/\/+$/, "");
  }
  return DEFAULT_SITE_ORIGIN;
}
