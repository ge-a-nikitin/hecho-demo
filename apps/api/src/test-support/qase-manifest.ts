/**
 * Source of truth for the Qase TestOps cases that mirror the automated suites.
 *
 * Tests never carry numeric case IDs: they call `qc("<key>", "<title>")`, and the
 * helper resolves the ID from the generated `qase-case-ids.ts`. `pnpm qase:sync`
 * creates the missing cases in the `suite` path below, keeps their content in
 * step with the catalogue, and writes their IDs back, so renaming or adding a
 * case is a single edit here instead of an API round trip.
 *
 * The catalogue itself lives in `qase/cases/`, one module per product area. Each
 * entry carries the content TestOps shows to a human - description, steps,
 * preconditions - because a case has to be understandable without the spec.
 *
 * The `title` must match the test title exactly - `qc()` refuses to run when the
 * two drift apart, which keeps the manifest and the suites in sync. Suites below
 * mirror the `describe` tree, because the reporter reports that tree as well.
 */
export { qaseCases, type QaseCaseKey } from "./qase/index.js";
export type {
  QaseBehavior,
  QaseCase,
  QaseCaseType,
  QaseLayer,
  QasePriority,
  QaseSeverity,
  QaseStep,
} from "./qase/types.js";
