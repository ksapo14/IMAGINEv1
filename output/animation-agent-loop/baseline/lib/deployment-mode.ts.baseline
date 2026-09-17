/** Shared copy for every frontend-only guard and accessible notice. */
export const FRONTEND_ONLY_NOTICE =
  "This deployment is frontend-only. Live generation and microphone features are unavailable.";

/**
 * Keep local and backend-enabled deployments unchanged unless the public policy
 * explicitly opts in or Vercel supplies a nonblank environment name.
 */
export function isFrontendOnlyDeployment() {
  const explicitMode = process.env.NEXT_PUBLIC_FRONTEND_ONLY?.trim().toLowerCase();
  if (explicitMode === "true") return true;
  if (explicitMode === "false") return false;
  return Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV?.trim());
}
