import { describe, expect, it } from "vitest";
import { qc } from "./qase-case.js";
import { qaseCaseIds } from "./qase-case-ids.js";
import { qaseCases } from "./qase-manifest.js";

describe("Tooling", () => {
  describe("Qase manifest", () => {
    it(qc("tooling.qase-manifest.unique-keys", "keeps every case key unique"), () => {
      const keys = qaseCases.map((entry) => entry.key);

      expect(new Set(keys).size).toBe(keys.length);
    });

    it(
      qc("tooling.qase-manifest.suite-paths", "gives every case a suite path and an automated layer"),
      () => {
        for (const entry of qaseCases) {
          expect(entry.suite.length, `${entry.key} has no suite`).toBeGreaterThan(0);
          expect(["e2e", "api", "unit"], `${entry.key} layer`).toContain(entry.layer);
        }
      },
    );

    it(
      qc(
        "tooling.qase-manifest.generated-ids",
        "resolves generated case IDs only through manifest keys",
      ),
      () => {
        const keys = new Set<string>(qaseCases.map((entry) => entry.key));

        for (const key of Object.keys(qaseCaseIds)) {
          expect(keys.has(key), `stale case ID for "${key}"`).toBe(true);
        }
      },
    );
  });
});
