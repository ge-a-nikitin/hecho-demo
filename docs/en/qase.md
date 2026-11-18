# Qase TestOps reporting

[← Documentation](./README.md) · [Русская версия](../ru/qase.md)

This page explains how the automated suites relate to the `HECHO` project in Qase TestOps: where the case catalogue lives, how it is synchronised with the project, who sends results and when, and how to check the whole path locally. When the page and the code disagree, trust the catalogue in `apps/api/src/test-support/qase/` and the `.github/workflows/qase.yml` workflow. Change the process, change the page.

Qase is for reporting only. No suite needs the network, so pull-request checks stay offline and results go out after a merge into `main`.

## Case catalogue

- Cases live in `apps/api/src/test-support/qase/cases/`, one module per product area. `qase-manifest.ts` pulls them into a single catalogue: key, suite path (mirroring the `describe` tree), title, severity, priority and layer. Next to that sits what a human sees in TestOps: an English description of why the case exists, preconditions, classic steps (`action` and expected result), optional postconditions, and the Qase type and behavior.
- Every entry names its own Qase `type`, and the catalogue refuses `other`. `functional` is the ordinary shape of the catalogue, `regression` marks a case written to catch the side effect of an edit, `integration` covers the sync against the TestOps project. The field is required, so a case that cannot answer this question does not compile and never reaches the project as one more `other`.
- The integer field codes live in `apps/api/src/test-support/qase/enums.ts`. TestOps accepts them without documenting what they mean, and their order does not follow the dropdown: `functional` is 8, `other` is 1. The tables were read off a live case card and pinned by `enums.spec.ts`, because an order taken from the interface does not fail the build; it files cases under the wrong type. That is how 91 functional cases once sat on `Other`.
- Tests call `qc("<key>", "<title>")` from `apps/api/src/test-support/qase-case.ts`, which fails collection when a key is missing or the title drifted, and stays a no-op until IDs exist, so offline runs and pull-request checks never depend on Qase. The browser suite in `apps/web` calls the same helper through a relative import (`../../api/src/test-support/qase-case`): the catalogue has one owner, and the package boundaries stay free of a published workspace dependency for test-only code.
- Both packages are scanned for `qc()` calls, so a `web.*` key is checked exactly like an api one: the browser suite files a case under `Web / <area>` in `apps/web/src` and `apps/web/test`, and the sync credits `apps/web/...` as the owning spec.
- The browser suite has two levels. Specs next to the code (`apps/web/src/**/*.spec.tsx`) cover a helper or a single component in isolation. Specs under `apps/web/test/integration` mount `App` behind its real router, providers and session and replace only `fetch` (`test/integration/support/fake-api.ts`), so they assert what a person sees after a click: a list loads, a retry recovers the load, an order moves to another group. Both levels run in one `vitest` call in the same `web` job, and neither needs a backend, a database or a network.
- TestOps has three layers: `e2e`, `api` and `unit`. The browser suite files its cases as `unit` even though it renders whole pages, because `e2e` belongs to the Playwright suite in `ge-a-nikitin/hecho-e2e`, which drives a real stack in a real browser, and these cases never leave the process. `type` draws the finer line: `integration` marks a case that renders a whole page behind the real router and providers, `functional` marks a helper or a single component.
- A case is identified by its `order-desk:<key>` tag, so renaming or moving an entry patches the existing case and keeps its ID and result history. An entry carries the identity tag, its layer and every suite slug, written as a set: TestOps stores tags as a set and drops a repeated title. A layer that matches a suite root (`api` in `API / …`) therefore must not appear twice in the payload, or the sync would report that case as drifted on every run and never converge. An entry that leaves the catalogue is not deleted. The TestOps API has no case archive, so the sync moves the case to `Archive / <original top level suite>` with its tags and results intact, and a restored entry brings the same case back.
- The catalogue checks run without a network. `apps/api/src/test-support/qase-manifest.spec.ts` keeps keys, suite paths and layers unique, requires an explicit type other than `other`, rejects stale generated IDs, and demands a generated ID for every catalogue key, non-empty content, preconditions and at least three steps for API cases, and exactly one spec per key in both directions. `apps/api/src/test-support/qase/sync-plan.spec.ts` checks the sync rules the same way: tag identity, archiving, restore, duplicate tags and tag composition.

## Synchronisation with the project

- `pnpm qase:sync --dry-run` prints the plan and leaves the project alone, but exits with code 1 when the plan is not empty. That is how CI catches a drifted catalogue after a merge.
- `pnpm qase:sync` creates the missing suites and cases in Qase TestOps, rewrites the cases whose content or metadata drifted, and refreshes `apps/api/src/test-support/qase-case-ids.ts` with the numeric IDs. The sync is idempotent — a second run reports every case as unchanged.
- Each description ends with an `_Automated by <spec>_` line derived from the `qc()` calls, so moving a spec file updates its case on the next sync.
- `qase-case-ids.ts` is generated: only the sync writes it, and it is never edited by hand.
- A sync reaches the project immediately; the tests reach `main` only on merge. Syncing from a branch therefore leaves the `catalogue` job on `main` disagreeing until that pull request lands: the plan asks to archive the new case and to revert the rewritten ones. That is the order the workflow expects, and the merge puts both sides back in step. Nobody rolls the project back to silence the check.

## Local runs with reporting

- `pnpm --filter @order-desk/api test:qase` reports the unit suite and `pnpm --filter @order-desk/api test:qase:integration` reports the integration one. Both export `QASE_MODE=testops`, create a run, attach every result to its case, complete the run, and print the run link.
- `pnpm qase:run` does the same for day-to-day work: it syncs the catalogue and runs the unit suite with reporting.
- The browser suite reports with `pnpm --filter @order-desk/web test:qase`, which exports `QASE_MODE=testops` and reads `apps/web/qase.config.json`; its run title defaults to `Order Desk Web · automated run`.
- A parameterized test reports several results on one case: `does not allow cancelling an invoiced order` runs for two statuses. A unit run of 110 tests therefore reports 110 results onto 109 cases.
- A run link looks like `https://app.qase.io/run/HECHO/dashboard/<id>`. Extracting it from a log needs `grep -oE 'Test run link: https://[^ ]+' | tail -1 | awk '{print $NF}'`, because other addresses appear before it in the output.

## CI runs

- Results are reported only after a merge. `.github/workflows/qase.yml` runs on a push to `main` and manually. The `catalogue` job checks the catalogue with `qase:sync --dry-run` and fails when it and the project disagree. The `unit`, `web` and `integration` jobs run the suites with `QASE_MODE=testops` and write their run link into the job summary. The `e2e-report` job calls the reusable workflow of `ge-a-nikitin/hecho-e2e` with `qase-mode: testops` for the merged commit, and `publish` comments all four links on the merged pull request.
- The browser run is titled `Order Desk web · e2e · <sha>`, is tagged `ci,e2e`, and reports onto the cases of the suite's own catalogue, not the one in `apps/api/src/test-support/qase/`. `.github/workflows/e2e.yml` runs the same suite on every pull request with `qase-mode: off`, because only `main` may report and a merge that triggered both workflows would build the images twice.
- The pull-request run builds GitHub's merge commit: on `pull_request` `github.sha` is `refs/pull/<N>/merge`, so the images carry the pull request merged into the current `main`, and the suite's `[stack] the running build matches the checkout at <short sha>` line names that commit. `e2e.yml` passes `verify-sut-context: false` (the reusable workflow refuses it unless `sut-ref: pin`, and the pin describes the suite's snapshot, not the pull request) and passes no `secrets` at all, because an offline run needs none and a token handed to a job that builds pull-request code is a token the pull request can read.
- A pull request never receives the Qase token, so its checks stay offline and a fork cannot send results to the project. The token lives in the `QASE_TESTOPS_API_TOKEN` repository secret, and only `qase.yml` passes it.
- The pull-request check is named `e2e / Suite`, because GitHub joins the caller's job name (`e2e`) and the called one (`Suite`), and it stays advisory: no branch protection requires it, and making it required would block every merge whenever the suite's `main` is red.
- Defects in Qase are not linked to GitHub Issues: a defect found while writing or rewriting tests is fixed in the same pull request together with a regression test.

## Configuration

- `apps/api/qase.config.json` holds the project `HECHO` on the US cluster `qase.io` with `mode: off`, so ordinary runs stay offline. `apps/web/qase.config.json` repeats those settings for the browser suite, because the reporter reads the file from the package it runs in and a suite started from `apps/web` would otherwise have no project.
- The API token comes from `QASE_TESTOPS_API_TOKEN` in the git-ignored `.env`.
- `QASE_MODE`, `QASE_TESTOPS_PROJECT`, `QASE_TESTOPS_API_HOST` and `QASE_TESTOPS_RUN_TITLE` override the file when a run needs different settings.

## When a run does not appear

1. Check that `QASE_MODE=testops`: with `off` the suite passes without reporting anything.
2. Check `QASE_TESTOPS_API_TOKEN`: without it `qase:sync` and the reporting runs fail with an authentication error.
3. Look at the `catalogue` job: a failure there means the catalogue and the project disagree, so run `pnpm qase:sync` and commit `qase-case-ids.ts` first.
4. Check the case tags in TestOps: a result finds its case by `order-desk:<key>`, so a renamed key without a sync leaves the result without a case.
