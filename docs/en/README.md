# HECHO — documentation

[← Project root](../../README.md) · [Русская версия](../ru/README.md) · [Database schema](./database-schema.md)

> **About the project.** HECHO was built entirely in vibe-coding mode and may contain inaccuracies. The author is a QA engineer, not a professional developer; the project's main purpose is to be a lightweight showcase base for the author's QA portfolio.

## Contents

- [Purpose](#purpose)
- [Agreed functionality](#agreed-functionality)
- [Technical constraints and preferences](#technical-constraints-and-preferences)
- [Interface and design system](#interface-and-design-system)
- [Implementation plan](#implementation-plan)
- [Open questions](#open-questions)
- [Backlog](#backlog)
- [Running the project locally](#running-the-project-locally)
- [Deploying to a home VM (Cloudflare Tunnel)](#deploying-to-a-home-vm-cloudflare-tunnel)

## Purpose

A single-organization application for accepting orders from registered customers, distributing and performing work, tracking time, and issuing internal invoices.

This document records the agreed requirements, implementation status, and launch instructions. The monorepo foundation, PostgreSQL schema, and core backend API domain scenarios are implemented. The frontend includes a public landing page, authentication, and customer, executor, and administrator panels with profiles and order cards. The API and frontend run in Docker Compose together with PostgreSQL and SeaweedFS. Automated end-to-end checks are maintained in a separate training repository and are not part of this project; stable QA locators and a devtools API are supported here.

## Agreed functionality

### Public home page

- Before signing in, a user sees a public landing page that explains the purpose of the order board and the main order workflow.
- The landing page provides links to sign in and to customer registration.
- The landing page is public and does not show order data or internal organization information.

### Roles and access

- **Customer** creates orders and tracks their own orders.
- **Executor** accepts and performs orders.
- **Administrator** manages users and all orders.
- A customer can self-register on the site.
- Customer registration is open to any visitor; the account is activated immediately after registration.
- Executor accounts are created by an administrator.
- The initial administrator account is created by a separate CLI command from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; repeated runs do not change an existing administrator.
- When creating an executor, the administrator sets an initial password and communicates it outside the application. The administrator does not set the hourly rate: the executor sets and changes it independently in their profile. The administrator resets customer or executor passwords; customer self-service password recovery is deferred until email is connected.
- Sign-out is available in the sidebar on wide screens and in the top bar on mobile.
- Accounts are deactivated, not deleted, to preserve order and invoice history.
- Before deactivating an executor, the administrator must reassign all their unfinished orders.
- One user has one role. Customer, executor, and administrator sign in through different routes/panels; credentials for one role do not grant access to other roles' panels.
- A customer sees only the orders they created and related comments and invoices.

### Order creation and distribution

- A customer can choose an executor when creating an order or leave the order unassigned.
- Unassigned orders are available to the administrator for distribution and to executors in the shared pool.
- In the shared pool, all executors see the full order description and attachments.
- An order is locked to the first executor who takes it from the pool.
- The administrator can also distribute orders.
- One executor performs an order. The administrator can reassign an order; the history preserves the previous executor.
- The selected or assigned executor can decline an order; the order returns to the unassigned pool.
- In a draft, the customer can change all data. After submission, the main order parameters cannot be edited; the customer can add comments.
- Title, description, and category are required. Due date, attachments/files, and location or address are optional.
- Work categories are created by the administrator. The customer selects a category when creating an order; the executor sees the category and can filter the order list by it. The executor does not assign categories.
- Order lists in all panels support search by title and description, filtering by status and category, and pagination of 10 orders per page.
- The customer, assigned executor, and administrator can leave comments in the order history; comments are visible to all participants.

### Statuses

Agreed order flow:

- **New** — customer draft.
- After submission, the draft becomes **Waiting for distribution** if no executor is selected, or **Assigned** if one is selected.
- The administrator can assign an executor to an order awaiting distribution. The executor who first takes an order from the pool claims it; the order becomes **Assigned**.
- The assigned executor proposes the number of hours and the calculated amount. The customer confirms the proposal; work cannot start before confirmation.
- After confirmation, the order moves to **In progress**.
- The executor submits the completed work for review: **On review**.
- If the customer requests changes, the order moves to **Needs revision**. When the executor starts revisions, the order returns to **In progress**; after revisions, the executor submits the order for review again: **On review**.
- After the customer accepts the work, the administrator issues an invoice: **Invoice issued**.
- After accepting the work, the customer reports payment, and the order awaits the administrator's payment review in the **Invoice issued** status. After review, the administrator confirms payment, and the order moves to **Invoice paid**. Completion is a separate administrator action after confirming receipt of funds; only then does the order become **Completed**.
- An order can be **Cancelled** according to the rules below.

### Order cancellation

- Before work starts, the customer or administrator can cancel the order.
- Before work starts, a cancellation reason is not required.
- After work starts, only the administrator can cancel the order; a reason is required.
- After an invoice is issued, the order cannot be cancelled: an unpaid invoice is voided, after which a new one can be issued. A paid invoice is immutable and cannot be voided; post-payment adjustments are outside the current process.

### Rate, estimate, and time tracking

- The executor sets and changes the hourly rate in their profile; the administrator cannot set or change it. Rates may differ.
- The assigned executor proposes the number of hours. The amount is calculated automatically: executor's rate × proposed hours.
- The customer confirms the proposed hours and calculated amount before work starts.
- If the customer rejects the proposal, they leave a comment, the order returns to the unassigned pool, and the order history records the return from the approval stage.
- The rate is fixed for the order at the time of the proposal and does not change if the profile rate changes later.
- The executor enters actual time manually as a single summary entry with a comment.
- The executor can edit the summary time while the order is **In progress**. Actual time and the comment are visible to the executor, customer, and administrator.
- Actual time is tracked separately and does not change the invoice amount calculated from the agreed hours.

### Invoice and payment

- After the customer accepts the work, the administrator issues an invoice.
- The invoice is generated in the application and can be downloaded as a PDF.
- The customer pays the invoice by bank transfer outside the application.
- After the transfer, the customer marks the invoice as paid in the application and must attach proof of payment (receipt). A payment notification cannot be submitted without a proof file.
- Payment proof is stored separately from regular order attachments and is available to the customer and administrators; the executor does not see the payment document.
- The customer's mark moves the payment to "Pending review", but does not by itself confirm receipt of funds or complete the order.
- The administrator verifies receipt of funds and the attached document, then manually confirms payment. After confirmation, the invoice becomes paid and the order moves to **Invoice paid**; this still does not complete the order.
- Completing the order is a separate administrator action in the **Invoice paid** status. It records `completedAt` and moves the order to **Completed**; completion is unavailable without a paid invoice.
- If the confirmation is incorrect or the payment is not found, the administrator does not confirm payment; the order remains open until the situation is resolved.
- When rejecting a receipt, the administrator must provide a reason. The customer sees the reason and can upload a new receipt; previous receipts and decisions remain in history.
- The receipt is uploaded to a separate payment field/section, with the same file upload restrictions (any type, maximum 1 MB), and is not considered a regular work attachment.
- Automatic payment processing through an external provider is outside the MVP and may be added later.
- At this stage, the invoice is an internal, non-legal document.
- The invoice currency is USD.
- The PDF invoice contains the number, date, customer and executor names, agreed hours, rate, and total amount.
- Amounts are rounded to 2 decimal places. The invoice number is unique and sequential within a year, format: `INV-YYYY-000001`.
- The invoice stores snapshots of customer and executor names, hours, rate, and amount at the time of issue; changing a profile or order does not change an already issued invoice. Number sequencing is maintained by a separate counter per year and incremented atomically in a transaction.
- An unpaid invoice can be voided with a reason and the administrator who performed the action, and then a new one can be issued. A voided invoice and its number are preserved; the number is not reused. An order can have only one active invoice. A paid invoice is immutable; post-payment adjustments are outside the current process.

### Files and notifications

- Files of any type up to 1 MB per file can be attached to an order.
- Notifications are outside the MVP.

## Technical constraints and preferences

- The current ER diagram and data model constraints are described in [database-schema.md](./database-schema.md).
- A single TypeScript monorepo with `pnpm workspaces`.
- Backend: NestJS, REST API, Swagger/OpenAPI.
- Frontend: a single React + Vite + TypeScript application with `/customer`, `/executor`, and `/admin` panels.
- Each panel uses separate pages for order lists, profile, and other standalone sections.
- The order card opens over the list: a centred dialog with a dimmed background on wide screens, and a bottom sheet that can be swiped away on mobile. Order details have their own URL: direct navigation, page refresh, and browser navigation must work without losing the list context where available.
- Interactive UI elements must have stable QA locators (preferably `data-testid` attributes) for external test scenarios. Locators must not depend on CSS classes, DOM structure, or displayed text. Automated e2e tests are maintained in a separate training repository and are not run from this project.
- Database: PostgreSQL; data access and migrations: Prisma.
- Authentication: Better Auth with data stored in PostgreSQL. All panels use one session system; separate routes and server-side role checks prevent access to other panels and APIs.

- The devtools API is enabled only by explicit `DEVTOOLS_ENABLED=true` and protected by a separate `x-devtools-api-key` from `DEVTOOLS_API_KEY`. The endpoints allow creating a user with a given role (CUSTOMER/EXECUTOR/ADMIN) by email and password, listing users of a selected role, changing a user's email/password and activity by ID, and loading/removing a fixed test data set. The password and API key are not returned; the submitted password is hashed by Better Auth, and existing user sessions are revoked after an email/password change or deactivation. The seed password is stored only locally in `DEVTOOLS_SEED_PASSWORD`; the JSON fixture stores only data set contents, not secrets. The key is set by the environment administrator, currently via `.env`; if devtools must be deployed to production, they should be enabled only after an explicit decision, with the key and seed password stored in a secure secrets vault and network access restricted. A full project reset is available through `POST /api/devtools/reset` (the request must contain `{"confirm":"reset-all-data"}`) and `pnpm db:reset`: they delete all data, users, sessions and stored file objects, then recreate the single administrator from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Bulk demo data is deterministic and described by a declarative JSON fixture in `apps/api/src/devtools/fixtures/test-data.json`. Re-running replaces the fixed set; cleanup removes reserved seed records along with invoices, receipts, and other dependent records created for seed orders, and does not affect data unrelated to the seed set. If manually created records reference a seed user or seed category, cleanup returns a conflict requiring those links to be removed first.
- The API validates DTOs on the server (extra fields are forbidden), the session, user activity, role, permissions for a specific order, and the validity of state transitions; client-side validation is not considered a security boundary. REST API errors are returned with a machine-readable `code` field (`BAD_REQUEST`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `INTERNAL_SERVER_ERROR`, etc.). Unhandled server details are not sent to the client, and validation errors do not contain field values. The interface translates the error code into a human-readable message and shows action errors/results in a dismissible toast at the top of the page.
- The interface is localized into English (default), Russian, and Spanish. The language switcher is available on the landing page, sign-in and registration pages, panels, and the 404 page, and the choice is saved in `localStorage` under the key `order-desk.language`. The `?lang=en|ru|es` parameter sets the language at open time and takes precedence over the saved choice; an unknown value is ignored. The interface language does not change URLs and does not translate user data (order and category names, names, comments). Interface texts are in `apps/web/src/i18n/messages/{en,ru,es}.ts`, and dates, numbers, monetary amounts, and time units are formatted according to the selected locale.
- Local file storage: SeaweedFS via an S3-compatible API.
- Services run in Docker Compose. Default local ports: `6200` frontend, `6201` API, `6202` PostgreSQL, `6203` SeaweedFS S3 API, `6204` SeaweedFS Admin UI; values can be overridden in `.env`.

## Interface and design system

Web styles are layered in `apps/web/src/styles/` and imported from `main.tsx` in cascade order: `tokens.css` (design tokens and base layer), `system.css` (buttons, states, language switcher), `landing.css`, `panel.css`, `orders.css`, `overlays.css` (sheet and toast), `motion.css` (accessibility fallbacks).

- Tokens define a type scale in `rem` (12 px is the floor for interface text), a spacing scale, three radii, three elevation steps, materials (`--material-*`), motion parameters (`--response-*`, `--ease-*`), and text colors with at least 4.5:1 contrast for small text. Sizes are expressed in `rem` so the layout follows the user's text-size setting.
- Response: every interactive element reacts on pointer-down (`:active`), not at the end of the click, and `touch-action: manipulation` removes the tap delay. A hover effect never replaces press feedback.
- Materials: the landing header, panel top bar and sidebar, mobile tab bar, toast, and order sheet are translucent layers with `backdrop-filter`; hard dividers are replaced by fading hairlines, and the mobile tab bar respects `env(safe-area-inset-bottom)`.
- Motion: a small in-house spring integrator in `apps/web/src/motion/spring.ts` uses `response` and `damping` (Apple's parameters) with no external dependencies. The order sheet controller in `apps/web/src/motion/sheet.ts` implements a Pointer Events gesture with pointer capture, 1:1 tracking from the grab point, resistance past the open position, release velocity handed to the spring, and a close/return decision based on the sign of that velocity. Animations always start from the live on-screen value, so a new gesture interrupts and redirects them without a jump.
- The dismiss gesture works from the sheet's top zone (grabber and header). Order content keeps native scrolling so the gesture never fights the scroll; dragging is disabled on wide screens.
- Modal behaviour: while the order detail is open the page scroll is frozen, focus moves inside, `Tab`/`Shift+Tab` stay within the sheet, `Esc` and a scrim click close it, and focus returns to the element that opened it.
- Accessibility: `prefers-reduced-motion` replaces movement with a short cross-fade and disables card tilt and lift, `prefers-reduced-transparency` makes materials opaque, and `prefers-contrast: more` adds solid borders, higher-contrast text, and a stronger focus ring.

## Implementation plan

Preferred order — bottom-up, from database to interfaces:

1. **Repository and database foundation (done):** workspace and Docker Compose created; Prisma models and PostgreSQL migrations added for users, categories, orders, status history and assignments, estimates, time tracking, comments, attachments, and invoices. The schema accounts for user deactivation, invoice data snapshots, atomic yearly number sequencing, voiding an unpaid invoice, and issuing a new one without deleting history.
2. **Backend/API (core scenarios implemented):** NestJS API, Better Auth, server-side role and deactivated-account checks, Swagger/OpenAPI, health endpoint, initial administrator, categories, administrative management of executors and customers, order assignment/reassignment/decline/cancellation, estimate proposals and customer responses, work execution and review, time tracking, and comments are ready. SeaweedFS attachments with a 1 MB limit, PDF invoices with Cyrillic support, sequential yearly numbering, voiding and reissuing an unpaid invoice, customer payment receipt submission with manual administrator review/rejection, transitioning an order to `INVOICE_PAID` after payment confirmation, and a separate administrative order completion are also implemented. Customer rejection of an estimate requires a comment. Devtools API with an enable flag and API key check added: create/list/update users, a repeatable JSON seed with cleanup of seed records and related invoices and receipts, and a full project reset that purges stored files and recreates the administrator from `.env`. Build, types, and migrations have been verified; the order scenarios are covered by an integration suite that runs against a dedicated ephemeral stack.

3. **Frontend (core scenarios implemented):** React, Vite, and TypeScript configured; public landing page, registration/sign-in via Better Auth, session cookie handling, role checks for customer, executor, and administrator panels, navigation, and profile added. In the profile, a user can change name and email after confirming the current password, and change the password with revocation of other sessions; an email change is applied immediately, without confirming the new address, and resets the `emailVerified` flag. The order card opens at its own URL over the list: as a centred dialog on wide screens and as a draggable bottom sheet on mobile devices; it shows participants, statuses and history, estimates, tracked time, files, invoices, receipts, and comments according to API permissions. The customer loads categories and orders, creates an order with optional executor selection, saves a draft, edits and submits it, accepts/rejects the executor's estimate (providing a reason when rejecting), accepts the work or requests revisions, attaches files to the draft, leaves comments, cancels the order before work starts, and submits a receipt for an issued invoice and sees review results. The executor loads available and assigned orders, takes an order from the pool, proposes an estimate, tracks time, declines an assignment, and submits work for review or continues revisions. The administrator views orders, assigns/reassigns them, issues invoices, downloads invoice PDFs, voids an unpaid invoice with a reason and issues a new one, reviews/rejects receipts, confirms payment, and separately completes a paid order. On a separate users page, the administrator sees executors and customers, including inactive ones, creates executors without a rate, edits an executor's name, resets passwords, and activates/deactivates accounts. API errors are shown in the interface; interactive elements are marked with stable `data-testid`. Order lists support search, status and category filters, and pagination; on mobile, sign-out is available in the top bar. Production build and targeted checks have been verified; end-to-end scenarios are maintained in a separate repository.
4. **Docker Compose (done):** API and frontend builds added; the frontend is served by Nginx with support for direct URL navigation. Compose starts all services, waits for PostgreSQL readiness, applies Prisma migrations before starting the API, and checks its health endpoint. Service ports are configured via `.env`.
5. **End-to-end checks (outside the repository):** automated e2e checks run in a separate training repository. This project retains API unit and integration tests, the devtools API, and stable `data-testid` for external scenarios; Playwright and the e2e suite are not part of the project.

The Better Auth integration with NestJS and Prisma has been verified by registration, sign-in, and session retrieval; registration creates a user with the `CUSTOMER` role.

## Open questions

- Clarify the display-name format for the administrator created from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Describe response schemas in Swagger: parameters, request bodies and allowed enum values are documented, while response bodies are returned without typed schemas. A complete contract needs response DTOs or dedicated serializers.
- Configure CSP and rate limiting for `/api/auth/*` in Cloudflare (Transform Rules and WAF Rate limiting). A strict CSP needs separate handling for Swagger UI, so the decision is deferred until publication. Restricting Swagger through Cloudflare Access is not set up yet either.

## Backlog

Queue of test-infrastructure work. Each item is deferred deliberately and names the reason and the dependency on the previous one.

1. **CI on pull requests.** `.github/workflows/` currently holds only `deploy.yml`, so types, the build, unit and integration tests are checked locally, and a regression can reach `main`. The checks move to GitHub Actions on `ubuntu-latest` and become required for merging: the self-hosted runner with Docker socket access stays with the deployment only, because the repository is public. Once the required checks are enabled, the merge button stays unavailable until they are green.
2. **Reporting runs to Qase from CI.** Reports are sent manually from a workstation today. Only runs that reached a merge should reach Qase: a pull request verifies everything offline and without a token, and after the push to `main` the same suite runs with result reporting, a commit link in the run description, and a comment in the merged pull request. The official Qase GitHub app synchronises defects with issues and does not report runs, so the run link is published by our own job. This item follows CI, because without it there are no runs to report.
3. **A dedicated Qase page.** The Qase section in the README has grown into a paragraph that overloads the launch instructions; it moves to `docs/{ru,en}/qase.md`, and the README keeps a short summary and a link.
4. **Coverage of untested modules.** There are no unit tests for attachment upload and download (`orders/order-files.service.ts`), session and role checks (`auth/session.guard.ts`), categories, the S3 storage service, and some DTO constraints. They are covered with cases after CI, so that the pipeline catches regressions instead of a local run.
5. **Rewriting tests by TDD.** Some unit cases assert Prisma call arguments, which reflects the implementation rather than observable behaviour. The rewrite goes slice by slice (orders → invoices → users → devtools → common → integration) through red-green-refactor, after CI, so that the pipeline catches regressions.

Defects found while writing or rewriting tests are fixed in the same pull request together with a regression test and block the merge: they belong to the development process and are not filed as issues. The bug report form stays for defects a user can see.

## Running the project locally

### Requirements

- Docker Engine with Docker Compose v2 (`docker compose`); Docker Desktop works on Windows and macOS.
- Git for cloning the repository.
- Free local ports listed below.
- Node.js `22.18` or newer and pnpm `12.15` are required only for development and running workspace commands on the host. For a normal Compose run, Node.js/pnpm on the host are not required.

### First run via Docker Compose

1. Clone the repository and go to its root.
2. Create a local environment file: `cp .env.example .env` (on Windows PowerShell: `Copy-Item .env.example .env`).
3. Open `.env` and replace all `replace-this-*` values with unique local passwords/secrets. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first administrator. PostgreSQL passwords must be URL-safe (letters, digits, and `._~-`), because the API uses them in `DATABASE_URL`.
4. Build the images and start all services: `docker compose up --build -d`. The first run may take a few minutes. The API waits for PostgreSQL and automatically applies all migrations before becoming available.
5. Create the initial administrator account: `docker compose exec api pnpm --filter @order-desk/api db:seed:admin`. This command is safe to re-run and does not change an existing administrator.
6. Open the frontend and sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`; executors can be created from the administrator panel. Customers can register independently.

### Default addresses and ports

| Service | Host address | Purpose |
|---|---|---|
| Frontend | `http://localhost:6200` | Application |
| API | `http://localhost:6201/api` | REST API and Better Auth |
| Swagger | `http://localhost:6201/api/docs` | API contract and interactive documentation: request body schemas and examples, allowed enum values |
| API health check | `http://localhost:6201/api/health` | Health endpoint |
| PostgreSQL | `localhost:6202` | Database |
| SeaweedFS S3 API | `http://localhost:6203` | File storage |
| SeaweedFS Admin UI | `http://localhost:6204` | Local storage administration |

Ports are bound to `127.0.0.1`, so services are available only from the local machine. Inside the Compose network, the API uses PostgreSQL at `postgres:5432` and SeaweedFS at `seaweedfs:8333`.

### Port and address configuration

If a port is busy, change the corresponding value in `.env` and rebuild/restart Compose:

- `WEB_PORT` — frontend port on the host.
- `API_PORT` — API port on the host.
- `POSTGRES_PORT` — PostgreSQL port on the host (update the port in `DATABASE_URL` if you run migrations from the host).
- `S3_PORT` — S3 API port on the host.
- `SEAWEEDFS_ADMIN_PORT` — SeaweedFS Admin UI port on the host.

When changing frontend/API ports, update the related origins/URLs in `.env`: `VITE_API_URL` must point to the public API address with `/api`, `BETTER_AUTH_URL` to the same address with `/api/auth`, and `FRONTEND_ORIGIN` to the frontend origin. Then run `docker compose up --build -d` to rebuild the frontend with the new `VITE_API_URL`. For DB/S3 parameters, Docker services use internal network names; `DATABASE_URL` and `S3_ENDPOINT` in the API container are automatically overridden by Compose.

### Everyday commands

- Service status: `docker compose ps`.
- Logs for all services: `docker compose logs -f`; for one service, e.g. API: `docker compose logs -f api`.
- Restart after changing configuration/code: `docker compose up --build -d`.
- Start after a host reboot: containers are declared with `restart: "no"`, so they do not start automatically with the system — bring the stack up manually with `docker compose up -d`. Docker also does not restart containers after a crash; if you need crash recovery and start on boot, restore `restart: unless-stopped` in `docker-compose.yml`.
- Stop without deleting data: `docker compose down`.
- Reset all data without stopping containers: `pnpm db:reset` or, with devtools enabled, `POST /api/devtools/reset` with the `x-devtools-api-key` header. Orders, invoices, files, users and sessions are deleted, and the administrator from `.env` is recreated.
- Full cleanup of the local database and files: `docker compose down -v` **deletes PostgreSQL and SeaweedFS data without the possibility of recovery**.

### Development with applications running on the host

For hot reload, install Node.js and pnpm, then run `pnpm install`. Create `.env` according to the instructions above and start only the infrastructure: `docker compose up -d postgres seaweedfs`. Validate the Prisma schema/client (`pnpm db:validate`, `pnpm db:generate`), apply migrations via `pnpm db:migrate`, then create the administrator with `pnpm db:seed:admin`. In separate terminals, start the API `pnpm --filter @order-desk/api dev` and frontend `pnpm --filter @order-desk/web dev`. In the browser, the frontend is usually available at `http://localhost:6200`, the API at `http://localhost:6201`; `VITE_API_URL` and `FRONTEND_ORIGIN` must match the actual addresses.

### Automated tests

- API unit tests run on Vitest and live next to the code (`apps/api/src/**/*.spec.ts`), fully offline, without a database or network: `pnpm --filter @order-desk/api test`. The configuration is `apps/api/vitest.config.ts`, and suites are grouped by function (`Orders` → `Lifecycle`, `Invoices` → `Payment reports`, and so on), so the report tree mirrors the code structure.
- Integration tests drive the real HTTP API: `pnpm --filter @order-desk/api test:integration`. The global setup builds and starts the dedicated `docker-compose.test.yml` stack (project `order-desk-test`, ports `7101` and `7102`), waits for `/api/health`, truncates the database through `POST /api/devtools/reset` before the run, and removes the containers together with their data (`docker compose down -v`) afterwards. The separate project name and ports keep the suite away from development or production data, and the reset fails loudly when the stack is not the test one.
- There is one integration suite so far — the order lifecycle: draft → pool → concurrent claim → estimate → execution → review → acceptance, plus estimate rejection, revisions, cancellation, access control, and request validation. It needs Docker; the first run builds the API image and therefore takes a few minutes.
- Environment overrides: `TEST_API_URL` (API address, default `http://127.0.0.1:7101`), `TEST_STACK_MANAGED=false` (reuse a stack you started yourself), `TEST_STACK_KEEP=true` (keep the containers after the run for inspection), `TEST_COMPOSE_FILE` (a different compose file).
- Type checking covers the test code as well: `pnpm typecheck` runs `tsc --noEmit` for `src` and `tsc --noEmit -p apps/api/tsconfig.test.json` for `test` and the Vitest configs.

#### Qase TestOps reporting

- Cases live in `apps/api/src/test-support/qase/cases/`, one module per product area, and `qase-manifest.ts` re-exports them as a single catalogue: key, suite path (mirroring the `describe` tree), title, severity, priority, layer, plus the content TestOps shows to a human — an English description of why the case exists, preconditions, classic steps (`action` and expected result), optional postconditions, and the Qase type and behavior. Tests call `qc("<key>", "<title>")` from `apps/api/src/test-support/qase-case.ts`, which fails collection when a key is missing or the title drifted, and stays a no-op until IDs exist, so offline runs and pull-request checks never depend on Qase.
- `pnpm qase:sync --dry-run` prints the plan without touching the project; `pnpm qase:sync` creates the missing suites and cases in Qase TestOps, rewrites the cases whose content or metadata drifted, and refreshes `apps/api/src/test-support/qase-case-ids.ts` with the numeric IDs. The sync is idempotent — a second run reports every case as unchanged. Each description ends with an `_Automated by <spec>_` line derived from the `qc()` calls, so moving a spec file updates its case on the next sync.
- A case is identified by its `order-desk:<key>` tag, so renaming or moving a catalogue entry patches the existing case and keeps its ID and result history. When an entry leaves the catalogue, its case is not deleted: the TestOps API has no case archive, so the sync moves it to `Archive / <original top level suite>` with its tags and results intact, and restoring the entry moves the same case back.
- `apps/api/src/test-support/qase-manifest.spec.ts` keeps the catalogue honest offline: unique keys, suite paths and layers, no stale generated IDs, non-empty content, API cases with preconditions and at least three steps, and exactly one spec per key in both directions. `apps/api/src/test-support/qase/sync-plan.spec.ts` covers the sync rules the same way — tag identity, archiving, restore and duplicate tags — without touching the network.
- Sending results: `pnpm --filter @order-desk/api test:qase` for the unit suite and `pnpm --filter @order-desk/api test:qase:integration` for the ephemeral stack. Both export `QASE_MODE=testops`, create a run, attach every result to its case, complete the run, and print the run link.
- Configuration is `apps/api/qase.config.json` (project `HECHO`, US cluster `qase.io`, `mode: off` so ordinary runs stay offline). The API token comes from `QASE_TESTOPS_API_TOKEN` in the git-ignored `.env`; `QASE_MODE`, `QASE_TESTOPS_PROJECT`, `QASE_TESTOPS_API_HOST` and `QASE_TESTOPS_RUN_TITLE` override the file when a run needs different settings.
- A parameterized test reports several results on one case (the `does not allow cancelling an invoiced order` case runs for two statuses), so a unit run of 43 tests covers 42 cases with results.
- GitHub status sync for pull requests is not configured yet.

### Devtools and test data

For local use of the devtools API, set `DEVTOOLS_ENABLED=true`, set a random `DEVTOOLS_API_KEY` at least 32 bytes long, and `DEVTOOLS_SEED_PASSWORD` in `.env`; requests send the key in the `x-devtools-api-key` header. While the flag is not `true`, the whole devtools group answers `404` as if the endpoints did not exist and is hidden from Swagger; once enabled they appear in `/api/docs` with described request bodies and answer `401` without a valid key. In Swagger UI the key is entered in the `x-devtools-api-key` field of each operation. The role value is case-sensitive: only `CUSTOMER`, `EXECUTOR`, and `ADMIN` are accepted, and Swagger offers a dropdown with these values for the `role` parameter and the `role` request body field. Endpoints are available via Swagger/Postman: `POST /api/devtools/users`, `GET /api/devtools/users?role=CUSTOMER|EXECUTOR|ADMIN`, `PATCH /api/devtools/users/{id}`, `POST /api/devtools/seed` (replace the fixed set), and `DELETE /api/devtools/seed` (remove it). The seed creates accounts `devtools.admin@example.test`, `devtools.customer@example.test`, and `devtools.executor@example.test` with the password from `DEVTOOLS_SEED_PASSWORD`. Cleanup removes seed users, categories, orders, as well as invoices and payment confirmations related to seed orders. If a seed record is used by manually created data, for example a seed executor is assigned to a regular order, cleanup returns a conflict: reassign or delete such records first. File objects in SeaweedFS are not deleted when the seed set is cleared; only a full reset removes them. Do not enable devtools unnecessarily and do not use production keys in a local environment.

A full project reset runs through `POST /api/devtools/reset` with the body `{"confirm":"reset-all-data"}`. The request deletes all users with their accounts and sessions, categories, orders with comments, estimates, assignments, status history, time entries and attachments, invoices with payment reports, and the invoice numbering; in the same transaction it recreates the single administrator from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. The required `confirm` field guards against accidental calls: without it or with another value the API returns `400`, and a wrong key returns `401`; if `ADMIN_EMAIL` or `ADMIN_PASSWORD` is missing, the reset is rejected before any data is deleted. Every session is revoked, so sign in again with the password from `.env`, and invoice numbering restarts at 1. After the commit the SeaweedFS bucket is purged completely, including orphaned objects (`"purgeFiles": false` keeps the files); if the storage is unreachable, the database still stays reset and the response contains `files.error`, so the objects must be removed manually. `pnpm db:reset` performs the same operation without a running API: it reads `DATABASE_URL`, `S3_*` and `ADMIN_*` from `.env` and exits with a non-zero code when files could not be deleted. The response contains the created administrator, the number of deleted records per type, and the file purge outcome.

## Deploying to a home VM (Cloudflare Tunnel)

Production uses the same `docker-compose.yml` plus the `docker-compose.prod.yml` overlay. There is no proxy container: TLS terminates at the Cloudflare edge, the `cloudflared` tunnel runs as a systemd service on the same VM and connects to `127.0.0.1:8080`, and the only application entry point is nginx from the `web` image — it serves the SPA assets and proxies `/api/*` to the `api:6201` container. No inbound router ports are needed, because the tunnel establishes an outbound connection itself.

```text
browser → Cloudflare (TLS, cache, WAF) → cloudflared on the VM → nginx:8080 → api:6201 or SPA assets
```

### What you need

- A VM (a QEMU virtual machine on a home computer is fine) with Docker Engine and Docker Compose v2, git and curl; 2+ GB of RAM and space for the `postgres_data` and `seaweedfs_data` volumes.
- A domain whose zone is delegated to Cloudflare and shows the Active status: the application is published on `hecho-demo.hius2.fyi`, so the `hius2.fyi` zone must be Active.
- A tunnel token from Cloudflare Zero Trust.

### Environment and secret layout

Configuration is split in two so that secrets never reach git:

| Where | What | Why |
|---|---|---|
| `deploy/prod.env` (tracked) | `DOMAIN`, `WEB_PORT`, `TRUST_PROXY`, `DEVTOOLS_ENABLED`, `COMPOSE_FILE`, `POSTGRES_USER`, `POSTGRES_DB`, `ADMIN_EMAIL`, `S3_ACCESS_KEY`, `S3_BUCKET`, `SEAWEEDFS_ADMIN_USER` | Not secrets: changes show up in diffs and get reviewed |
| GitHub → Environments → `production` → secret `PROD_ENV_SECRETS` (multi-line) | `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `ADMIN_PASSWORD`, `S3_SECRET_KEY`, `SEAWEEDFS_ADMIN_PASSWORD` | Encrypted, available only to workflows of that environment, masked as `***` in logs |
| `/etc/cloudflared/` on the VM | the tunnel token | Not part of the application and never stored in the repository |
| `.env` on the VM (created by the deploy, mode `600`) | `deploy/prod.env` concatenated with `PROD_ENV_SECRETS` | The only format `docker compose` reads |

`deploy/prod.env` contains `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`, so the short `docker compose ...` commands are enough on the VM. For a local check the overlay is passed explicitly: `docker compose -f docker-compose.yml -f docker-compose.prod.yml config`.

An honest boundary: with this approach secrets exist in plaintext in `.env` on the VM disk and in the environment of the container processes. They are protected by mode `600` and a dedicated VM user; the runner itself has access to the Docker socket, which effectively means root on the VM, so access to the VM and its disk must be restricted separately (disk encryption, for example).

### One-time VM setup

1. Install Docker Engine with Compose v2, git and curl; clone the repository into the directory the runner will work from.
2. Connect the tunnel (Cloudflare issues the token when the tunnel is created):

   ```bash
   sudo cloudflared service install <TUNNEL_TOKEN>
   sudo systemctl enable --now cloudflared
   systemctl status cloudflared
   ```

3. In Cloudflare Zero Trust create a Public Hostname `hecho-demo.hius2.fyi` with an empty path and the service `HTTP://localhost:8080`. The tunnel creates the DNS record itself, so delete conflicting A/CNAME records beforehand. Enable Always Use HTTPS in the zone settings (HSTS is optional).
4. Register a self-hosted runner (Settings → Actions → Runners) and install it as a service:

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -fsSLO <actions-runner-linux-x64.tar.gz link from the runner page>
   tar xzf actions-runner-linux-x64.tar.gz
   ./config.sh --url https://github.com/<owner>/<repo> --token <runner-token> --labels order-desk --unattended
   sudo ./svc.sh install "$USER" && sudo ./svc.sh start
   ```

   The repository is public, so the workflow deliberately runs only on `push` to `main` and on manual `workflow_dispatch`. Never add the `pull_request` event: code from a fork would then execute on the VM.

### Deployment

On every push to `main` (or a manual run) `.github/workflows/deploy.yml`:

1. checks out the repository;
2. renders `.env` from `deploy/prod.env` and the `PROD_ENV_SECRETS` secret with mode `600` and verifies the file stays untracked;
3. runs `docker compose up -d --build --remove-orphans`;
4. waits for `http://127.0.0.1:8080/` and `http://127.0.0.1:8080/api/health` (up to 200 seconds) and prints `docker compose ps` plus the `api`/`web` logs on failure;
5. prunes dangling images.

Manual update on the VM: `git pull && docker compose up -d --build`.

### First start

1. Fill in `deploy/prod.env` (`ADMIN_EMAIL` must be the real administrator address) and add the `PROD_ENV_SECRETS` secret to the `production` environment; generate secrets with `openssl rand -base64 32` and keep the PostgreSQL password URL-safe.
2. Run the workflow and wait for a green result.
3. Create the administrator once, manually:

   ```bash
   docker compose exec api pnpm --filter @order-desk/api db:seed:admin
   ```

   The deploy does not create an administrator: `ADMIN_EMAIL`/`ADMIN_PASSWORD` are used only by the seed command and the full reset.
4. Verify production: `curl -I https://hecho-demo.hius2.fyi`, `curl https://hecho-demo.hius2.fyi/api/health`, open `https://hecho-demo.hius2.fyi/api/docs`, and sign in to the interface as the administrator. Upload a file to an order — this checks both the cookie session and SeaweedFS.

### Rotating secrets

The general flow: change the value in GitHub → run the deploy again. The workflow rewrites `.env` and recreates the containers. Special cases:

| Secret | What to keep in mind |
|---|---|
| `BETTER_AUTH_SECRET` | Every session is invalidated, so users must sign in again. |
| `ADMIN_PASSWORD` | Affects only `db:seed:admin` and the full reset; the password of an existing administrator does not change. |
| `POSTGRES_PASSWORD` | The password of an already initialised database does not change by itself: run `docker compose exec -T postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "ALTER USER <POSTGRES_USER> WITH PASSWORD '<new password>'"`, then update the secret and deploy. |
| `S3_SECRET_KEY`, `SEAWEEDFS_ADMIN_PASSWORD` | Volume data survives; after the deploy check a file upload and sign-in to the SeaweedFS admin UI. |

### Operations

- Status: `docker compose ps`. Application logs: `docker compose logs -f`, API only: `docker compose logs -f api`, tunnel: `journalctl -u cloudflared -f`.
- VM reboot: containers with `restart: unless-stopped` come back automatically, as do the `cloudflared` and runner services. In local mode without the overlay the containers still do not restart.
- Database backup: `docker compose exec -T postgres pg_dump -U <POSTGRES_USER> <POSTGRES_DB> | gzip > backup-$(date +%F).sql.gz`. Files live in the `seaweedfs_data` volume; copy it with `seaweedfs` stopped, or through `docker run --rm -v <project>_seaweedfs_data:/data -v "$PWD":/backup alpine tar czf /backup/files.tgz /data`.
- Domain change: edit `DOMAIN` in `deploy/prod.env`, add the new Public Hostname to the tunnel and deploy. `FRONTEND_ORIGIN` and `BETTER_AUTH_URL` are derived from `DOMAIN`, and the frontend is built with the relative `VITE_API_URL=/api`, so no rebuild for a specific domain is needed. Users must sign in again, because the old cookies belong to the previous domain.
- `TRUST_PROXY=true` (not a number): three hops sit in front of the API — Cloudflare, cloudflared and nginx — and the origin is not reachable directly. Without it the protocol is seen as `http` (cookies lose `Secure`) and the client IP is wrong.
- After `docker compose restart api` nginx may answer `502`, because the container received a new address. `docker compose restart web` fixes it; the regular `up -d --build` recreates the whole network and does not hit this problem.
- Devtools are disabled in production (`DEVTOOLS_ENABLED=false`): the endpoints answer `404` and are hidden from Swagger, including the full data reset.
- Only `127.0.0.1:8080` is published for the tunnel; the `api`, `postgres` and `seaweedfs` ports stay on `127.0.0.1` for debugging.

### Production limitations

- Swagger is public — this is a project decision. For restricted access, put a Cloudflare Access application over `/api/docs*`: no tunnel routes need to change.
- No CSP and no rate limiting for `/api/auth/*`: both are configured in Cloudflare (Transform Rules and WAF Rate limiting), not in the repository. Note that Swagger UI is incompatible with a strict CSP.
- `docker compose down -v` deletes the PostgreSQL and SeaweedFS data; back up with `pg_dump` and volume copies instead of deleting the stack.
- There is no separate CI workflow yet: type checks, the build, the API unit tests and the integration suite run locally (`pnpm typecheck`, `pnpm build`, `pnpm --filter @order-desk/api test`, `pnpm --filter @order-desk/api test:integration`) and will move to Actions together with broader test coverage.
