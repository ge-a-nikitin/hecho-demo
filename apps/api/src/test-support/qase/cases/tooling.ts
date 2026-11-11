import type { QaseCase } from "../types.js";

const manifestSuite = ["Tooling", "Qase manifest"] as const;
const syncSuite = ["Tooling", "Qase sync"] as const;

export const toolingCases = [
  {
    key: "tooling.qase-manifest.unique-keys",
    suite: manifestSuite,
    title: "keeps every case key unique",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "functional",
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
    type: "functional",
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
    type: "regression",
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
    key: "tooling.qase-manifest.linked-ids",
    suite: manifestSuite,
    title: "links every manifest key to a generated case ID",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "regression",
    behavior: "positive",
    description:
      "A result only lands on a TestOps case when `qc()` can read the numeric ID that the sync generated: " +
      "without one the helper returns the bare title, the reporter creates nothing, and the result is " +
      "dropped silently. The offline parity check turns that silence into a failing test as soon as a " +
      "catalogue entry has no ID, so a case added in a pull request cannot reach `main` unlinked.",
    steps: [
      {
        action: "Compare every manifest key with the generated ID map.",
        expected: "Each key resolves to a numeric TestOps case ID.",
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
    type: "functional",
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
    type: "regression",
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
  {
    key: "tooling.qase-manifest.case-type",
    suite: manifestSuite,
    title: "labels every case with a specific type instead of other",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Qase `Type` answers what kind of testing a case performs, so a catalogue that leaves the field on " +
      "`other` says nothing a reader can filter or report on. Each entry names its type deliberately: " +
      "`functional` for the shape the catalogue has to keep, `regression` where the case exists to catch " +
      "the side effect of an edit to the manifest or to a spec, and `integration` for the sync against the " +
      "TestOps repository. A new case that cannot answer the question shows up here instead of reaching " +
      "the project as another `other`.",
    steps: [
      {
        action: "Walk every manifest entry and read its `type`.",
        expected: "Each entry declares a type and none of them is `other`.",
      },
    ],
  },
  {
    key: "tooling.qase-sync.adoption",
    suite: syncSuite,
    title: "adopts an existing case by its order-desk tag so a rename keeps its ID",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "TestOps stores results against numeric case IDs, so replacing a case whenever its title or suite " +
      "changes would detach the whole history of that behaviour from the case that now describes it. The " +
      "sync therefore treats the `order-desk:<key>` tag as the identity: a case found by tag is reused, and " +
      "the rename or move is applied to it as an ordinary update.",
    steps: [
      {
        action: "Plan a sync where the remote case still has the old title and sits in the old suite.",
        expected: "The plan matches the remote case ID to the manifest key instead of asking for a new case.",
      },
      {
        action: "Inspect the planned archive moves.",
        expected: "The matched case is not archived, because its key is still in the catalogue.",
      },
    ],
  },
  {
    key: "tooling.qase-sync.archive",
    suite: syncSuite,
    title: "moves a retired case into the Archive suite instead of deleting it",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "integration",
    behavior: "negative",
    description:
      "Removing a test usually removes the behaviour from the manifest too, but the case still documents " +
      "what the product used to guarantee and it may be the container of historical results. TestOps has no " +
      "case archive in its API, so the sync emulates one by moving the case under `Archive / <original top " +
      "level suite>`, which keeps it out of the active tree without destroying anything.",
    steps: [
      {
        action: "Plan a sync where a tagged remote case no longer appears in the catalogue.",
        expected:
          "The plan asks to move that case to `Archive / <original top level suite>` rather than to delete it.",
      },
      {
        action: "Plan the same sync again with the case already inside `Archive`.",
        expected: "No further move is planned, so repeated syncs stay idempotent.",
      },
    ],
  },
  {
    key: "tooling.qase-sync.restore",
    suite: syncSuite,
    title: "brings an archived case back to its suite when its key returns",
    severity: "major",
    priority: "low",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "A retired behaviour often comes back, and with it comes the case that already documented it. " +
      "Because archiving only moves the case, the tag survives, so the returning key finds its old case and " +
      "the sync moves it home: the restored case keeps the ID, and therefore the history, of the archived one.",
    steps: [
      {
        action: "Plan a sync where the remote case sits in `Archive / Orders` and its key is back in the catalogue.",
        expected: "The plan matches that case to the key instead of creating a second case for the same behaviour.",
      },
      {
        action: "Compare the planned target suite with the manifest suite.",
        expected: "The matched case is patched back into the manifest suite, not left in `Archive`.",
      },
    ],
  },
  {
    key: "tooling.qase-sync.conflicts",
    suite: syncSuite,
    title: "refuses to guess when two cases carry the same catalogue tag",
    severity: "critical",
    priority: "medium",
    layer: "unit",
    type: "integration",
    behavior: "negative",
    description:
      "The tag is the identity, so two cases carrying the same tag make the identity ambiguous: patching " +
      "one of them would silently leave the other as a stale copy that never receives results. The plan " +
      "reports the conflict and the sync stops before writing anything, which leaves the decision to a human.",
    steps: [
      {
        action: "Plan a sync in which two remote cases carry the tag of one manifest key.",
        expected: "The plan reports a conflict naming the key and both case IDs.",
      },
      {
        action: "Run the sync with that plan.",
        expected: "The sync throws before creating, updating or archiving anything.",
      },
    ],
  },
  {
    key: "tooling.qase-sync.drift",
    suite: syncSuite,
    title: "reports a dry run as drift when applying it would write anything",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "Once runs are reported from the pipeline, the catalogue and TestOps can drift apart unnoticed: a case " +
      "edited or added in a pull request lives only in the repository until somebody runs the sync. The " +
      "post-merge check runs the sync in dry-run mode and fails when the plan is not empty, so drift is " +
      "reported on the pipeline run that introduced it instead of surfacing as results dropped onto stale " +
      "cases. The check reads the same plan the sync applies, so it cannot disagree with it.",
    steps: [
      {
        action: "Summarize a dry run in which every catalogue entry already matches TestOps.",
        expected: "No drift is reported and the check passes.",
      },
      {
        action: "Summarize a dry run that would create a suite, create a case, update a case or archive one.",
        expected: "Drift is reported for each of those changes, so the check fails and names what is pending.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
