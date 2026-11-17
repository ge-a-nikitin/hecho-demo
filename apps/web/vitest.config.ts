import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Same contract as apps/api/vitest.config.ts: the Qase reporter reads its
// credentials from the environment, and they live in the git-ignored
// repository-root .env. An already exported QASE_* value still wins.
loadEnv({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

/**
 * Unit suite of the browser application.
 *
 * A case here stays offline and in-process: it renders component trees in jsdom
 * with the API replaced at the network boundary, or exercises a pure helper with
 * no DOM at all. The default environment is `node` on purpose, so a helper that
 * quietly starts reading `window` fails instead of passing on a borrowed
 * global; a spec that renders React asks for jsdom with the
 * `@vitest-environment jsdom` docblock at its top.
 *
 * The suite is wired into the Qase catalogue like the api ones: the catalogue
 * lives in `apps/api/src/test-support/qase`, so a spec imports `qc()` from
 * there. Those modules are plain TypeScript with no Nest or Prisma imports, so
 * the import costs nothing at run time.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    environment: "node",
    reporters:
      (process.env.QASE_MODE ?? "off") === "off"
        ? ["default"]
        : ["default", "vitest-qase-reporter"],
  },
});
