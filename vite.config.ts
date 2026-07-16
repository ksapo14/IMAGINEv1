import { createRequire } from "node:module";
import vinext from "vinext";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import { sites } from "./scripts/sites-vite-plugin";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const require = createRequire(import.meta.url);
const sitesWorkerRuntimeModules = new Set([
  "ipaddr.js",
  "react",
  "react-dom",
  "react-dom/server.edge",
  "react/jsx-runtime",
]);

function bundleSitesWorkerRuntime(): Plugin {
  return {
    name: "sites-bundle-worker-runtime",
    enforce: "pre",
    resolveId(source) {
      if (
        this.environment.name === "ssr" &&
        sitesWorkerRuntimeModules.has(source)
      ) {
        return require.resolve(source);
      }

      return null;
    },
  };
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const plugins: PluginOption[] = [bundleSitesWorkerRuntime(), vinext(), sites()];
  const supportsLocalWorkerd = !(
    process.platform === "win32" && process.arch === "arm64"
  );

  if (supportsLocalWorkerd) {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    );
  }

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins,
  };
});
