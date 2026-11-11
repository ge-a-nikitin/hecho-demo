import type { QaseCase } from "../types.js";

const manifestSuite = ["Tooling", "Qase manifest"] as const;

export const toolingCases = [
  {
    key: "tooling.qase-manifest.unique-keys",
    suite: manifestSuite,
    title: "keeps every case key unique",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "other",
    behavior: "positive",
    description:
      "Manifest keys are the identity the suites and the sync script agree on: `qc()` looks a key up, and " +
      "the generated ID map is keyed by it. A duplicate would silently shadow one of the two cases, so the " +
      "catalogue refuses to contain one.",
    steps: [
      {
        action: "Collect the `key` of every manifest entry.",
        expected: "The number of distinct keys equals the number of entries.",
      },
    ],
  },
  {
    key: "tooling.qase-manifest.suite-paths",
    suite: manifestSuite,
    title: "gives every case a suite path and an automated layer",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "other",
    behavior: "positive",
    description:
      "The sync creates suites from the `suite` path, so an empty path would leave a case without a home in " +
      "the TestOps repository. The layer must be one of the three automated layers, because it drives the " +
      "`layer` field the sync writes and the filtering on the TestOps side.",
    steps: [
      {
        action: "Walk every manifest entry.",
        expected:
          "Each entry has at least one suite segment, and its `layer` is one of `e2e`, `api` or `unit`.",
      },
    ],
  },
  {
    key: "tooling.qase-manifest.generated-ids",
    suite: manifestSuite,
    title: "resolves generated case IDs only through manifest keys",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "other",
    behavior: "positive",
    description:
      "`qase-case-ids.ts` is generated, so it can keep an ID for a case that no longer exists in the " +
      "manifest. The parity check turns that stale entry into a failing test instead of a result reported " +
      "onto an abandoned case, which is what keeps the catalogue honest after a rename.",
    steps: [
      {
        action: "Compare the keys of the generated ID map with the manifest keys.",
        expected: "Every generated key still exists in the manifest.",
      },
    ],
  },
  {
    key: "tooling.qase-manifest.case-content",
    suite: manifestSuite,
    title: "documents every case with a description, steps and layer-specific detail",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "other",
    behavior: "positive",
    description:
      "A TestOps case is read by people who will never open the spec file, so the manifest carries the full " +
      "case: a description that explains why the case exists, at least one step, and the preconditions that " +
      "an api case needs before it can be replayed by hand. The check also guards the API contract with " +
      "TestOps - titles are limited to 255 characters and a given suite cannot hold two cases with the same " +
      "title, because the sync resolves cases by that pair.",
    steps: [
      {
        action: "Walk every manifest entry and inspect its content fields.",
        expected:
          "`description` and every step are non-empty, `title` is at most 255 characters, and no two cases " +
          "share the same suite path and title.",
      },
      {
        action: "Check the cases of the `api` layer.",
        expected: "Each of them has preconditions and at least three steps, so it is replayable by hand.",
      },
    ],
  },
  {
    key: "tooling.qase-manifest.spec-coverage",
    suite: manifestSuite,
    title: "links every case to exactly one spec through qc()",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "other",
    behavior: "positive",
    description:
      "The manifest describes cases, the specs run them, and both directions have to agree: a manifest entry " +
      "without a `qc()` call is documentation for a test that no longer exists, and a `qc()` call whose key " +
      "is missing from the manifest fails collection already. This check scans the spec files and reports " +
      "the orphaned entries, and it also tells the sync which spec file to credit in the case description.",
    steps: [
      {
        action: "Scan every `*.spec.ts` file for `qc(\"<key>\"` calls.",
        expected:
          "Every manifest key appears in exactly one spec file, and no spec references a key that is absent " +
          "from the manifest.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
