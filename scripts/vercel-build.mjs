import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Run the installed Next CLI without relying on platform-specific shell syntax. */
function runVercelBuild() {
  const require = createRequire(import.meta.url);
  const nextCli = require.resolve("next/dist/bin/next");
  const result = spawnSync(process.execPath, [nextCli, "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      IMAGINE_VERCEL_BUILD: "1"
    }
  });

  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  process.exitCode = result.status ?? 1;
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) runVercelBuild();
