import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Same contract as vitest.config.ts: Qase credentials come from the
// repository-root .env, never from the checked-in qase.config.json.
loadEnv({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

/**
 * Integration tests drive the real HTTP API of the ephemeral stack defined in
 * docker-compose.test.yml. The global setup starts and stops that stack, so a
 * plain `pnpm test:integration` is the only command needed; override
 * TEST_API_URL/TEST_STACK_MANAGED to point the suite at an already running stack.
 */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.spec.ts"],
    environment: "node",
    globalSetup: ["test/integration/helpers/global-setup.ts"],
    // Every spec shares one database and truncates it in beforeAll, so files must
    // not run concurrently; hooks need room for the container build and boot.
    fileParallelism: false,
    hookTimeout: 600_000,
    testTimeout: 30_000,
    reporters:
      (process.env.QASE_MODE ?? "off") === "off"
        ? ["default"]
        : ["default", "vitest-qase-reporter"],
  },
});
