# Qase TestOps reporting

[← Documentation](./README.md) · [Русская версия](../ru/qase.md)

This page describes how the automated suites relate to the `HECHO` project in Qase TestOps: where the case catalogue lives, how it is synchronised with the project, who sends results and when, and how to check the whole path locally. The sources of truth are the catalogue in `apps/api/src/test-support/qase/` and the `.github/workflows/qase.yml` workflow; update this page when the process changes.

The governing rule: Qase exists for reporting only. Neither suite needs the network, so pull-request checks stay offline and results are sent after a merge into `main`.

## Case catalogue

- Cases live in `apps/api/src/test-support/qase/cases/`, one module per product area, and `qase-manifest.ts` re-exports them as a single catalogue: key, suite path (mirroring the `describe` tree), title, severity, priority, layer, plus the content TestOps shows to a human — an English description of why the case exists, preconditions, classic steps (`action` and expected result), optional postconditions, and the Qase type and behavior.
- Tests call `qc("<key>", "<title>")` from `apps/api/src/test-support/qase-case.ts`, which fails collection when a key is missing or the title drifted, and stays a no-op until IDs exist, so offline runs and pull-request checks never depend on Qase.
- A case is identified by its `order-desk:<key>` tag, so renaming or moving a catalogue entry patches the existing case and keeps its ID and result history. When an entry leaves the catalogue, its case is not deleted: the TestOps API has no case archive, so the sync moves it to `Archive / <original top level suite>` with its tags and results intact, and restoring the entry moves the same case back.
- The catalogue is checked offline: `apps/api/src/test-support/qase-manifest.spec.ts` keeps unique keys, suite paths and layers, no stale generated IDs, a generated ID for every catalogue key, non-empty content, API cases with preconditions and at least three steps, and exactly one spec per key in both directions. `apps/api/src/test-support/qase/sync-plan.spec.ts` covers the sync rules the same way — tag identity, archiving, restore and duplicate tags — without touching the network.

## Synchronisation with the project

- `pnpm qase:sync --dry-run` prints the plan without touching the project, and exits with code 1 when the plan is not empty: that is the drift check between the catalogue and the project, and CI runs it after a merge.
- `pnpm qase:sync` creates the missing suites and cases in Qase TestOps, rewrites the cases whose content or metadata drifted, and refreshes `apps/api/src/test-support/qase-case-ids.ts` with the numeric IDs. The sync is idempotent — a second run reports every case as unchanged.
- Each description ends with an `_Automated by <spec>_` line derived from the `qc()` calls, so moving a spec file updates its case on the next sync.
- `qase-case-ids.ts` is generated: only the sync writes it, and it is never edited by hand.
- A sync reaches the project immediately, while the tests reach `main` only on merge, so syncing from a branch leaves the `catalogue` job on `main` disagreeing until that pull request lands: its plan asks to archive the new case and to revert the rewritten ones. That is the order the workflow expects, and the merge puts both sides back in step; the project is never rolled back to silence the check.

## Local runs with reporting

- `pnpm --filter @order-desk/api test:qase` reports the unit suite and `pnpm --filter @order-desk/api test:qase:integration` reports the integration one. Both export `QASE_MODE=testops`, create a run, attach every result to its case, complete the run, and print the run link.
- `pnpm qase:run` does the same for day-to-day work: it syncs the catalogue and runs the unit suite with reporting.
- A parameterized test reports several results on one case (the `does not allow cancelling an invoiced order` case runs for two statuses), so a unit run of 93 tests reports 93 results onto 92 cases.
- A run link looks like `https://app.qase.io/run/HECHO/dashboard/<id>`; extracting it from a log needs `grep -oE 'Test run link: https://[^ ]+' | tail -1 | awk '{print $NF}'`, because other addresses appear before it in the output.

## CI runs

- Results are reported only after a merge. `.github/workflows/qase.yml` runs on a push to `main` and manually: the `catalogue` job checks the catalogue with `qase:sync --dry-run` and fails when it and the project disagree, the `unit` and `integration` jobs run the suites with `QASE_MODE=testops` and write their run link into the job summary, and the `publish` job adds both links as a comment on the merged pull request.
- A pull request never receives the Qase token, so its checks stay offline and a fork cannot send results to the project. The token lives in the `QASE_TESTOPS_API_TOKEN` repository secret and only this workflow can read it.
- Defects in Qase are not linked to GitHub Issues: a defect found while writing or rewriting tests is fixed in the same pull request together with a regression test.

## Configuration

- `apps/api/qase.config.json` holds the project `HECHO` on the US cluster `qase.io` with `mode: off`, so ordinary runs stay offline.
- The API token comes from `QASE_TESTOPS_API_TOKEN` in the git-ignored `.env`.
- `QASE_MODE`, `QASE_TESTOPS_PROJECT`, `QASE_TESTOPS_API_HOST` and `QASE_TESTOPS_RUN_TITLE` override the file when a run needs different settings.

## When a run does not appear

1. Check that `QASE_MODE=testops`: with `off` the suite passes without reporting anything.
2. Check `QASE_TESTOPS_API_TOKEN`: without it `qase:sync` and the reporting runs fail with an authentication error.
3. Look at the `catalogue` job: a failure there means the catalogue and the project disagree, so run `pnpm qase:sync` and commit `qase-case-ids.ts` first.
4. Check the case tags in TestOps: a result finds its case by `order-desk:<key>`, so a renamed key without a sync leaves the result without a case.
