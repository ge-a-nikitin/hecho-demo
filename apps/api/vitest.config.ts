import { defineConfig } from "vitest/config";

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
