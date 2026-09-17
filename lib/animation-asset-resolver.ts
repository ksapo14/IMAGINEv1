import type { ResolvedAnimationAsset } from "@/components/workspace/types";

type AnimationAssetFetch = (input: string, init: RequestInit) => Promise<Response>;

export type RemoteAnimationAssetResolver = {
  resolve: (terms: string[], signal: AbortSignal) => Promise<Map<string, ResolvedAnimationAsset>>;
  getAssets: () => Map<string, ResolvedAnimationAsset>;
};

type ResolverOptions = {
  endpoint: string;
  fetchAssets?: AnimationAssetFetch;
  now?: () => number;
  timeoutMs?: number;
};

const MAX_CLIENT_ASSET_CACHE = 256;
const CLIENT_MISS_TTL_MS = 5 * 60 * 1000;

/** Identify the exact remote terms a mounted animation scene is waiting to settle. */
export function animationAssetTermsKey(terms: readonly string[]) {
  return terms.join("\u0000");
}

/** Keep a mounted scene settled after its request completes, even if a shared cache entry expires. */
export function isRemoteAnimationAssetResolutionPending(
  canResolveRemoteAssets: boolean,
  terms: readonly string[],
  settledTermsKey: string | null,
) {
  return canResolveRemoteAssets && settledTermsKey !== animationAssetTermsKey(terms);
}

function isResolvedAnimationAsset(value: unknown, requested: Set<string>): value is ResolvedAnimationAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<ResolvedAnimationAsset>;
  return typeof asset.term === "string" && requested.has(asset.term)
    && typeof asset.iconId === "string" && /^(lucide|tabler):[a-z0-9-]+$/.test(asset.iconId)
    && typeof asset.dataUrl === "string" && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl)
    && asset.dataUrl.length <= 100_000 && typeof asset.attribution === "string" && asset.attribution.length <= 160;
}

/** Wait for shared work without allowing one pane's cancellation to abort another pane. */
function waitForAsset(request: Promise<ResolvedAnimationAsset | null>, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(null);
  return Promise.race([
    request,
    new Promise<null>((resolve) => signal.addEventListener("abort", () => resolve(null), { once: true })),
  ]);
}

/**
 * Share bounded icon lookups across animation panes and remember failures briefly.
 * A completed miss lets the renderer immediately use its labeled shape fallback.
 */
export function createRemoteAnimationAssetResolver({
  endpoint,
  fetchAssets = fetch,
  now = Date.now,
  timeoutMs = 1700,
}: ResolverOptions): RemoteAnimationAssetResolver {
  const assets = new Map<string, ResolvedAnimationAsset>();
  const misses = new Map<string, number>();
  const requests = new Map<string, Promise<ResolvedAnimationAsset | null>>();

  function rememberAsset(asset: ResolvedAnimationAsset) {
    assets.delete(asset.term);
    assets.set(asset.term, asset);
    while (assets.size > MAX_CLIENT_ASSET_CACHE) assets.delete(assets.keys().next().value!);
  }

  function rememberMiss(term: string) {
    misses.set(term, now() + CLIENT_MISS_TTL_MS);
    while (misses.size > MAX_CLIENT_ASSET_CACHE) misses.delete(misses.keys().next().value!);
  }

  function hasMiss(term: string) {
    const expiry = misses.get(term);
    if (!expiry || expiry <= now()) {
      misses.delete(term);
      return false;
    }
    return true;
  }

  async function resolve(terms: string[], signal: AbortSignal) {
    const uniqueTerms = [...new Set(terms)];
    const fresh = uniqueTerms.filter((term) => !assets.has(term) && !hasMiss(term) && !requests.has(term));
    if (fresh.length) {
      const batch = Promise.resolve()
        .then(() => fetchAssets(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms: fresh }),
          signal: AbortSignal.timeout(timeoutMs),
        }))
        .then(async (response) => {
          if (!response.ok) {
            fresh.forEach(rememberMiss);
            return [] as ResolvedAnimationAsset[];
          }
          const payload = await response.json() as { assets?: unknown[] };
          const requested = new Set(fresh);
          const resolved = (payload.assets ?? []).filter((asset): asset is ResolvedAnimationAsset => (
            isResolvedAnimationAsset(asset, requested)
          ));
          resolved.forEach(rememberAsset);
          const resolvedTerms = new Set(resolved.map((asset) => asset.term));
          fresh.filter((term) => !resolvedTerms.has(term)).forEach(rememberMiss);
          return resolved;
        })
        .catch(() => {
          fresh.forEach(rememberMiss);
          return [] as ResolvedAnimationAsset[];
        });
      for (const term of fresh) {
        let request: Promise<ResolvedAnimationAsset | null>;
        request = batch.then((resolved) => resolved.find((asset) => asset.term === term) ?? null).finally(() => {
          if (requests.get(term) === request) requests.delete(term);
        });
        requests.set(term, request);
      }
    }
    await Promise.all(uniqueTerms.map((term) => {
      const request = requests.get(term);
      return request ? waitForAsset(request, signal) : Promise.resolve(null);
    }));
    return new Map(assets);
  }

  return { resolve, getAssets: () => new Map(assets) };
}
