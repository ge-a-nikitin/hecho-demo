import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// The reporter reads Qase credentials from the environment, and they live in the
// git-ignored repository-root .env. Loading it here keeps the token out of
// qase.config.json; an already exported QASE_* value still wins.
loadEnv({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

/**
 * Unit tests live next to the code they cover and must stay offline: no
 * database, no HTTP. Anything that needs a real stack belongs to the
 * integration suite, which has its own config (vitest.integration.config.ts).
 */
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    // The Qase reporter is only wired up when a run explicitly targets Qase,
    // so local runs and pull-request checks stay offline.
    reporters:
      (process.env.QASE_MODE ?? "off") === "off"
        ? ["default"]
        : ["default", "vitest-qase-reporter"],
  },
});
