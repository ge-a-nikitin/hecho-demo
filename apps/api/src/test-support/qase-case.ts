import { addQaseId } from "vitest-qase-reporter/vitest";
import { qaseCaseIds } from "./qase-case-ids.js";
import { type QaseCase, type QaseCaseKey, qaseCases } from "./qase-manifest.js";

const casesByKey = new Map<string, QaseCase>(
  qaseCases.map((entry): [string, QaseCase] => [entry.key, entry]),
);

/**
 * Resolves a manifest key into the test title the Qase reporter understands.
 *
 * The suite keeps a single source of truth in qase-manifest.ts: this helper
 * fails collection when a key is missing or when the title no longer matches,
 * and it stays a no-op until `qase:sync` has stored a numeric case ID. That way
 * offline runs and pull-request checks never depend on Qase availability.
 */
export function qc(key: QaseCaseKey, title: string): string {
  const entry = casesByKey.get(key);

  if (!entry) {
    throw new Error(`Unknown Qase case "${key}". Add it to src/test-support/qase-manifest.ts.`);
  }

  if (entry.title !== title) {
    throw new Error(
      `Qase case "${key}" is titled "${entry.title}" in the manifest but "${title}" in the suite. ` +
        "Keep both titles identical so the reported result lands on the right case.",
    );
  }

  const id = qaseCaseIds[key];

  return id === undefined ? title : addQaseId(title, [id]);
}
