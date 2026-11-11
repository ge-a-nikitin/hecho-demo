import { describe, expect, it } from "vitest";
import { qc } from "../qase-case.js";
import {
  archiveSuite,
  hasDrift,
  type PlannedCase,
  planArchives,
  planMatches,
  type RemoteCase,
  suitePathOf,
  type SuiteRef,
} from "./sync-plan.js";

const suites: readonly SuiteRef[] = [
  { id: 1, title: "API", parentId: null },
  { id: 2, title: "Orders", parentId: 1 },
  { id: 3, title: "Lifecycle", parentId: 2 },
  { id: 90, title: archiveSuite, parentId: null },
  { id: 91, title: "Orders", parentId: 90 },
];

const planned = (overrides: Partial<PlannedCase> = {}): PlannedCase => ({
  key: "orders.example",
  title: "rejects a cancellation after the invoice",
  suiteId: 3,
  ...overrides,
});

describe("Tooling", () => {
  describe("Qase sync", () => {
    it(
      qc(
        "tooling.qase-sync.adoption",
        "adopts an existing case by its order-desk tag so a rename keeps its ID",
      ),
      () => {
        const renamed: readonly RemoteCase[] = [
          { id: 11, title: "does not allow cancelling an order in %s", suiteId: 2, tags: [] },
          { id: 12, title: "old wording", suiteId: 2, tags: ["order-desk:orders.example"] },
        ];

        const plan = planMatches([planned()], renamed);

        expect(plan.conflicts).toEqual([]);
        expect(plan.missing).toEqual([]);
        expect(plan.matches.map((match) => [match.planned.key, match.remote.id])).toEqual([
          ["orders.example", 12],
        ]);
        expect(planArchives(new Set(["orders.example"]), renamed, suites)).toEqual([]);
      },
    );

    it(
      qc(
        "tooling.qase-sync.archive",
        "moves a retired case into the Archive suite instead of deleting it",
      ),
      () => {
        const retired: readonly RemoteCase[] = [
          { id: 13, title: "retired behaviour", suiteId: 3, tags: ["order-desk:orders.retired"] },
          { id: 14, title: "hand written case", suiteId: 3, tags: [] },
        ];

        expect(planArchives(new Set(["orders.example"]), retired, suites)).toEqual([
          {
            key: "orders.retired",
            id: 13,
            from: ["API", "Orders", "Lifecycle"],
            to: [archiveSuite, "API"],
          },
        ]);

        const alreadyArchived: readonly RemoteCase[] = [
          { id: 13, title: "retired behaviour", suiteId: 91, tags: ["order-desk:orders.retired"] },
        ];

        expect(planArchives(new Set(["orders.example"]), alreadyArchived, suites)).toEqual([]);
      },
    );

    it(
      qc(
        "tooling.qase-sync.restore",
        "brings an archived case back to its suite when its key returns",
      ),
      () => {
        const archived: readonly RemoteCase[] = [
          { id: 15, title: "rejects a cancellation after the invoice", suiteId: 91, tags: ["order-desk:orders.example"] },
        ];

        expect(suitePathOf(suites, 91)).toEqual([archiveSuite, "Orders"]);

        const plan = planMatches([planned()], archived);

        expect(plan.conflicts).toEqual([]);
        expect(plan.missing).toEqual([]);
        expect(plan.matches).toHaveLength(1);
        expect(plan.matches[0]?.remote.id).toBe(15);
        // The remote suite differs from the manifest suite, so the sync patches the case home.
        expect(plan.matches[0]?.remote.suiteId).not.toBe(plan.matches[0]?.planned.suiteId);
        expect(planArchives(new Set(["orders.example"]), archived, suites)).toEqual([]);
      },
    );

    it(
      qc(
        "tooling.qase-sync.conflicts",
        "refuses to guess when two cases carry the same catalogue tag",
      ),
      () => {
        const duplicated: readonly RemoteCase[] = [
          { id: 21, title: "first copy", suiteId: 3, tags: ["order-desk:orders.example"] },
          { id: 22, title: "second copy", suiteId: 91, tags: ["order-desk:orders.example"] },
        ];

        expect(planMatches([planned()], duplicated).conflicts).toEqual([
          { key: "orders.example", ids: [21, 22] },
        ]);
      },
    );
    it(
      qc(
        "tooling.qase-sync.drift",
        "reports a dry run as drift when applying it would write anything",
      ),
      () => {
        expect(hasDrift({ createdSuites: 0, createdCases: 0, updatedCases: 0, archivedCases: 0 })).toBe(
          false,
        );

        for (const change of ["createdSuites", "createdCases", "updatedCases", "archivedCases"] as const) {
          const changes = {
            createdSuites: 0,
            createdCases: 0,
            updatedCases: 0,
            archivedCases: 0,
            [change]: 1,
          };

          expect(hasDrift(changes), change).toBe(true);
        }
      },
    );
  });
});
