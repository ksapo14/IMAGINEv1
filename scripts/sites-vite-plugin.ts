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
            `${workerMarker}\nimport handler from "./app.js";\n\nconst worker = {\n  fetch(request, env, context) {\n    return handler.fetch(request, env, context);\n  },\n};\n\nexport default worker;\n`,
          );
        }
      }
    },
  };
}
