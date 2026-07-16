import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const serverEntry = resolve(root, "dist", "server", "index.js");
      const appEntry = resolve(root, "dist", "server", "app.js");
      const workerMarker = "// IMAGINE Sites worker entry";

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }

      if (await exists(serverEntry)) {
        const serverSource = await readFile(serverEntry, "utf8");
        if (!serverSource.startsWith(workerMarker)) {
          await rm(appEntry, { force: true });
          await rename(serverEntry, appEntry);
          await writeFile(
            serverEntry,
            `${workerMarker}\nconst worker = {\n  async fetch(request, _env, context) {\n    try {\n      const { default: handler } = await import("./app.js");\n      return await handler(request, context);\n    } catch (error) {\n      const name = error instanceof Error ? error.name : "UnknownError";\n      const message = error instanceof Error ? error.message : String(error);\n      console.error("[DEBUG] [dist/server/index.js] Worker module load failed", { name, message });\n      return new Response(JSON.stringify({ name, message }), {\n        status: 500,\n        headers: { "content-type": "application/json; charset=utf-8" },\n      });\n    }\n  },\n};\n\nexport default worker;\n`,
          );
        }
      }
    },
  };
}
