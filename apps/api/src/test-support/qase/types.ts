/**
 * Vocabulary shared by the Qase TestOps case catalogue and the sync script.
 *
 * The string unions below are the authoring format; `qase-sync-cases.ts` maps
 * them onto the integer codes the TestOps API stores. Keeping the manifest on
 * names instead of numbers makes the catalogue reviewable in a pull request.
 */

export type QaseSeverity = "blocker" | "critical" | "major" | "normal" | "minor" | "trivial";
export type QasePriority = "high" | "medium" | "low";
export type QaseLayer = "e2e" | "api" | "unit";

/** Qase "Type" field; the sync maps these onto 1-11 in the order Qase lists them. */
export type QaseCaseType =
  | "functional"
  | "smoke"
  | "regression"
  | "security"
  | "performance"
  | "acceptance"
  | "usability"
  | "compatibility"
  | "integration"
  | "exploratory"
  | "other";

/** Qase "Behavior" field: does the case exercise the happy path or a refusal? */
export type QaseBehavior = "positive" | "negative" | "destructive";

/** One classic step: what the tester does and what must hold afterwards. */
export interface QaseStep {
  readonly action: string;
  readonly expected: string;
  /** Concrete input, when the action alone is ambiguous. */
  readonly data?: string;
}

/**
 * One TestOps case. `title` must stay byte-identical to the title the suite
 * passes to `qc()`, because that is how a reported result finds its case.
 */
export interface QaseCase {
  readonly key: string;
  readonly suite: readonly string[];
  readonly title: string;
  readonly severity: QaseSeverity;
  readonly priority: QasePriority;
  readonly layer: QaseLayer;
  /** Why the case exists and what a failure would break, in Markdown. */
  readonly description: string;
  /** State the environment must be in before step 1; required for api cases. */
  readonly preconditions?: string;
  readonly steps: readonly QaseStep[];
  /** Cleanup or resting state after the last step, when the case changes data. */
  readonly postconditions?: string;
  readonly type?: QaseCaseType;
  readonly behavior?: QaseBehavior;
}
