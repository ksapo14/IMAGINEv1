const DEFAULT_SITE_ORIGIN = "http://localhost:3000";

export function getSiteOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configuredOrigin || DEFAULT_SITE_ORIGIN).replace(/\/+$/, "");
}
