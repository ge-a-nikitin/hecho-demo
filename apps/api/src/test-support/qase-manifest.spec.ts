import { describe, expect, it } from "vitest";
import { qc } from "./qase-case.js";
import { qaseCaseIds } from "./qase-case-ids.js";
import { qaseCases } from "./qase-manifest.js";
import { qcUsageIndex } from "./qase/spec-index.js";

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
          expect(keys.has(key), `stale case ID for \"${key}\"`).toBe(true);
        }
      },
    );

    it(
      qc("tooling.qase-manifest.linked-ids", "links every manifest key to a generated case ID"),
      () => {
        for (const entry of qaseCases) {
          expect(qaseCaseIds[entry.key], `${entry.key} has no generated case ID`).toEqual(
            expect.any(Number),
          );
        }
      },
    );

    it(
      qc(
        "tooling.qase-manifest.case-content",
        "documents every case with a description, steps and layer-specific detail",
      ),
      () => {
        const locations = new Set<string>();

        for (const entry of qaseCases) {
          expect(entry.description.trim(), `${entry.key} description`).not.toBe("");
          expect(entry.title.length, `${entry.key} title length`).toBeLessThanOrEqual(255);
          expect(entry.steps.length, `${entry.key} steps`).toBeGreaterThan(0);

          for (const [index, step] of entry.steps.entries()) {
            expect(step.action.trim(), `${entry.key} step ${index + 1} action`).not.toBe("");
            expect(step.expected.trim(), `${entry.key} step ${index + 1} expected`).not.toBe("");
          }

          if (entry.layer === "api") {
            expect(entry.preconditions?.trim(), `${entry.key} preconditions`).not.toBeUndefined();
            expect(entry.steps.length, `${entry.key} api steps`).toBeGreaterThanOrEqual(3);
          }

          const location = `${entry.suite.join(" / ")} > ${entry.title}`;
          expect(locations.has(location), `duplicate case \"${location}\"`).toBe(false);
          locations.add(location);
        }
      },
    );

    it(
      qc("tooling.qase-manifest.spec-coverage", "links every case to exactly one spec through qc()"),
      () => {
        const usage = qcUsageIndex();

        for (const entry of qaseCases) {
          const specs = usage.get(entry.key) ?? [];

          expect(specs.length, `${entry.key} is used by ${specs.length || "no"} spec(s)`).toBe(1);
        }

        const keys = new Set<string>(qaseCases.map((entry) => entry.key));

        for (const key of usage.keys()) {
          expect(keys.has(key), `\"${key}\" is called by a spec but missing from the manifest`).toBe(
            true,
          );
        }
      },
    );
    it(
      qc("tooling.qase-manifest.case-type", "labels every case with a specific type instead of other"),
      () => {
        for (const entry of qaseCases) {
          expect(entry.type, `${entry.key} type`).not.toBe("other");
        }
      },
    );
  });
});
