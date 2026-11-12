import { describe, expect, it } from "vitest";
import { qc } from "../qase-case.js";
import { behaviorIds, layerIds, priorityIds, severityIds, typeIds } from "./enums.js";

/** A field is sound when its options use every code from 1 up to their count, once each. */
const codesAreSound = (names: Readonly<Record<string, number>>): boolean => {
  const ids = Object.values(names).sort((left, right) => left - right);

  return ids.every((id, index) => id === index + 1);
};

describe("Tooling", () => {
  describe("Qase enums", () => {
    it(
      qc(
        "tooling.qase-enums.field-ids",
        "sends the field codes TestOps actually stores instead of the order of its dropdown",
      ),
      () => {
        // The codes the "Type" field of a case card reports, read off a live project.
        expect(typeIds).toEqual({
          other: 1,
          smoke: 2,
          regression: 3,
          security: 4,
          usability: 5,
          performance: 6,
          acceptance: 7,
          functional: 8,
          compatibility: 9,
          integration: 10,
          exploratory: 11,
        });

        expect(severityIds).toEqual({
          blocker: 1,
          critical: 2,
          major: 3,
          normal: 4,
          minor: 5,
          trivial: 6,
        });
        expect(priorityIds).toEqual({ high: 1, medium: 2, low: 3 });
        expect(layerIds).toEqual({ e2e: 1, api: 2, unit: 3 });
        expect(behaviorIds).toEqual({ positive: 1, negative: 2, destructive: 3 });

        // A gap or a repeated code would file cases under a neighbour's option.
        for (const names of [typeIds, severityIds, priorityIds, layerIds, behaviorIds]) {
          expect(codesAreSound(names)).toBe(true);
        }
      },
    );
  });
});
