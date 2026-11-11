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
    // The suite stays offline, but a few modules build a Prisma client and a
    // Better Auth instance while they are imported, and both refuse to construct
    // without their settings. The object storage reads its SeaweedFS endpoint and
    // credentials when the service is instantiated, and the S3 SDK is replaced by
    // a fake, so the placeholders only satisfy the constructor. They keep the run
    // self-contained — no local .env is required — and no real credential from
    // the environment can leak into a unit run.
    env: {
      DATABASE_URL: "postgresql://unit-test:unit-test@127.0.0.1:5432/unit-test",
      BETTER_AUTH_URL: "http://127.0.0.1:6201/api/auth",
      BETTER_AUTH_SECRET: "unit-test-secret-at-least-32-characters",
      S3_ENDPOINT: "http://127.0.0.1:6203",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY: "unit-test-access-key",
      S3_SECRET_KEY: "unit-test-secret-key",
      S3_BUCKET: "unit-test-bucket",
    },
    // The Qase reporter is only wired up when a run explicitly targets Qase,
    // so local runs and pull-request checks stay offline.
    reporters:
      (process.env.QASE_MODE ?? "off") === "off"
        ? ["default"]
        : ["default", "vitest-qase-reporter"],
  },
});
