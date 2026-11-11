# Working Guidelines

## Collaboration and planning

- Treat implementation requests as authorization to work toward implementation, but do not assume they waive the approval checkpoints below. Do not stop at a proposal unless the user asks for planning only.
- Use this workflow for substantial product or engineering work:
  1. Discover the problem and actively identify gaps in understanding. Ask focused, preferably grouped questions to clarify user needs, constraints, scope, edge cases, and acceptance criteria before treating requirements as settled. Summarize the requirements and get confirmation.
  2. Record confirmed requirements and relevant open questions in the appropriate project documentation.
  3. Explore relevant existing systems and identify architectural choices, dependencies, risks, and unresolved assumptions. Ask about consequential gaps, present the proposed architecture, and get agreement, including for data models, component boundaries, and contracts.
  4. Present an implementation plan ordered by dependencies. Clarify meaningful scope, sequencing, or acceptance gaps, then get approval before implementation. Build from foundational layers upward (for example, data and persistence, domain/API, then user interfaces), adapting the sequence to the project.
  5. Implement, verify against the agreed criteria and affected workflows, and update relevant documentation. If verification exposes a mismatch or an unmade product decision, report it and clarify the expected behavior rather than silently guessing.
- Treat confirmation as a checkpoint between requirements, architecture, and implementation planning for substantial work. A clear user instruction to carry the task through implementation, or explicit approval of multiple stages, may authorize proceeding through those checkpoints without pausing again; do not infer such blanket approval from an ambiguous acknowledgment.
- At each stage, ask enough to establish a shared understanding and expose important edge cases; batch related questions when practical. Do not treat silence or an unverified assumption as user agreement.
- Do not skip agreement on significant product or architecture decisions. Once the relevant scope and approach are agreed, handle routine implementation details autonomously.
- For small, low-risk changes, use this workflow proportionally rather than adding unnecessary planning overhead.
- Ask concise questions in the user's preferred language. Avoid unnecessary questions about details that are low-risk, evident from context, or safely resolved by established project conventions; state consequential assumptions and remaining uncertainties explicitly.
- Give brief progress updates at meaningful phase changes. In the final response, summarize the outcome, verification, commit, and remaining caveats.

## Documentation and contracts

- Keep this file in English. When starting work in a different project or adding project documentation whose language is unclear, ask the user which language to use. Preserve the language and style of existing documents unless asked to change them.
- Record agreed product behavior and operational instructions in the appropriate project documentation. Keep agent workflow guidance here rather than duplicating user-facing documentation.
- Record known defects, deferred decisions, and future improvements in the project's existing backlog, roadmap, or open-questions documentation. State why each item is deferred and, where useful, its impact or the condition/stage for revisiting it. Distinguish tracked follow-up work from agreed current scope; do not silently expand the implementation.
- When changing an API, protocol, schema, or other contract between components, update its authoritative documentation and generated/client types as applicable. Keep producers and consumers consistent.
- Enforce authentication, authorization, validation, and other trust-boundary checks in the trusted service or layer; client-side checks are not a security boundary.

## Repository changes

- Inspect relevant source, tests, configuration, and documentation before editing. Search for existing helpers and conventions before adding new ones.
- Make focused, complete changes that follow the repository's patterns. Prefer correctness, clear errors, and type-safe code; avoid unrelated cleanup.
- Preserve unrelated user changes. Never overwrite or revert work outside the agreed scope.
- Do not add secrets to version control. Update example configuration and setup documentation when required settings change.
- Update directly related tests and documentation when behavior changes. Do not create planning or tracking files unless requested.
- Do not perform destructive actions on user data or environments without explicit authorization.

## Testing

- Write and change tests with the `test-driven-development` skill: red, green, refactor. Add the failing test first, watch it fail, make it pass with the smallest change, then clean up while the suite stays green. If the skill is unavailable in the session, follow the same loop by hand.
- For a bug fix, reproduce the defect with a test before touching the implementation, and keep that test afterwards as the regression guard.
- Run the repository commands, not a generic one: the whole unit suite is `pnpm --filter @order-desk/api test`, a single file is `pnpm --filter @order-desk/api test src/orders/orders.dto.spec.ts` (no `--` separator, it eats the path), and a single case is `-t "<title>"` after the path.
- Keep unit suites offline: no database, no network, no credentials, so pull-request checks and local runs never depend on infrastructure. A test that needs the running stack belongs in `apps/api/test/integration` and runs through `pnpm --filter @order-desk/api test:integration`.
- Every test is a Qase TestOps case. Add or update its entry in the catalogue module under `apps/api/src/test-support/qase/cases/`, then call `it(qc("<key>", "<title>"), ...)`: `qc()` fails collection when the key is unknown or the title drifted, which keeps the catalogue and the suite together. Case content (`description`, `preconditions`, `steps`) is written in English, like the rest of the code, and explains why the case exists rather than restating the assertions.
- After changing a case entry, run `pnpm qase:sync --dry-run`, review the plan, then `pnpm qase:sync`, so descriptions, steps, tags, and case IDs reach TestOps. `qase-case-ids.ts` is generated and written only by the sync; never edit it by hand.
- When a test disappears, remove its catalogue entry and run `pnpm qase:sync` in the same change. Do not leave the catalogue ahead of or behind the suites: an offline parity test fails when a case ID survives its entry.
- Never delete a case in TestOps by hand. The sync identifies cases by their `order-desk:<key>` tag, so a renamed or moved case keeps its ID and history; a key that leaves the catalogue has its case moved to `Archive / <original top level suite>` instead of being deleted, and a key that comes back brings the same case home.

## Verification and completion

- Verify the actual acceptance criteria and affected user workflows, not only a proxy such as compilation. Run the smallest relevant existing tests and checks, expanding coverage when the change or results warrant it.
- For user-facing behavior, test the affected flow end to end when feasible. For runtime or deployment changes, build and run the affected services and check their health and relevant routes when feasible.
- Report checks that were not run and meaningful failures. Do not claim runtime behavior was verified based on static checks alone.
- Only report a task as complete after these checks pass or the remaining failures are explained, then commit and branch following the rules in Git workflow and deployment.

## Git workflow and deployment

`main` is the deployment branch: `.github/workflows/deploy.yml` publishes to the production host on every push to `main`, plus a manual `workflow_dispatch`. Treat a merge into `main` as a production release.

### Branches

- Never commit to `main` directly, even for one-line fixes. Branch from the current `main`, push the branch, and land the work through a pull request, so that `main` only ever receives reviewed, complete changes.
- Name branches `<type>/<short-kebab-case-slug>`, reusing the commit types: `feat/order-filters`, `fix/web-auth-base-url`, `docs/tunnel-runbook`, `ci/pull-request-checks`.
- Pushing a branch deploys nothing, because the workflow ignores every branch except `main`. Branches are therefore the safe place for experiments, and unsolicited pushes to them are harmless.
- Keep the branch current with `main` (rebase it, or merge `main` into it) before review, and resolve conflicts on the branch rather than on `main`.
- Do not force-push `main`, and do not rewrite a branch someone else is reviewing without saying so first. Delete the branch once the pull request is merged.

### Commits

- Follow the repository's Conventional Commits style: lowercase, imperative, with a scope when it adds information, for example `fix(web): resolve the better-auth base URL against the page origin` or `ci: deploy to the home VM from a self-hosted runner`.
- Keep one logical change per commit, and keep formatting-only or drive-by edits out of a functional commit.
- Automatically commit completed implementation changes unless the user asks not to. Before committing, inspect the diff, stage only task-related changes, and ensure the commit does not include unrelated user work.
- Never commit `.env` files, generated output, or secrets. Production configuration is `deploy/prod.env`, which stays non-secret and tracked, while the secrets themselves live in the GitHub `production` environment secret `PROD_ENV_SECRETS`.

### Pull requests and merging

- Before opening the pull request, run the relevant local checks for fast feedback: `pnpm typecheck`, `pnpm --filter @order-desk/api test`, and `pnpm build` when the change affects the bundles. `.github/workflows/checks.yml` repeats them on the pull request and gates the merge, so a failing or outdated run blocks it even after local success.
- Merge with a squash or a rebase so that `main` stays linear, and make the pull request title a valid commit subject, because a squash merge reuses it as the commit message.
- Describe in the pull request what was verified, naming the commands run and the workflows or routes exercised.
- Merging deploys. After the merge, confirm that the `Deploy` run for the merge commit succeeded and that production still answers (`https://hecho-demo.hius2.fyi/api/health`) instead of assuming it worked.
- Do not deploy by hand on the production host; let the workflow do it. `workflow_dispatch` exists only for re-running a deployment without a new commit, for example after changing the `PROD_ENV_SECRETS` secret.

### Runner safety

- `deploy.yml` runs on the self-hosted runner on the production host, which has Docker socket access. Never add a `pull_request` or any other untrusted-ref trigger to it: this repository is public, so such a trigger would let a fork execute its code on that host.
- Automated pull-request checks run from `.github/workflows/checks.yml` on GitHub-hosted `ubuntu-latest` runners and must never receive production secrets. Only `deploy.yml` uses the self-hosted runner.
