import type { QaseCase } from "../types.js";

const ordersPageSuite = ["Web", "Orders page"] as const;
const executorPanelSuite = ["Web", "Executor panel"] as const;

/**
 * Cases of the browser-side integration suite in `apps/web/test/integration`.
 *
 * These cases mount the whole application - the real router, the real providers
 * and the real api client - and replace only the server behind `fetch`, so they
 * describe what a person sees after a click rather than what a component renders.
 * The layer still says `unit`: TestOps offers three of them, `e2e` belongs to the
 * Playwright suite in ge-a-nikitin/hecho-e2e, and filing these as `e2e` would
 * claim coverage this repository does not provide.
 */
export const webIntegrationCases = [
  {
    key: "web.orders-page.loads-orders",
    suite: ordersPageSuite,
    title: "renders the orders the api returns and drops the loading state",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "The customer panel is the first screen that shows real data, and it is wired by hand: a fetch on mount, a " +
      "loading flag, an empty state and a list. A defect in that wiring leaves a customer staring at a spinner or at " +
      "`nothing here yet` although the orders exist, which no unit test of the filter helpers can catch. The case " +
      "mounts the application at `/customer` with the session of a customer and the api stubbed at `fetch`, so the " +
      "providers and the router are the ones the production build uses.",
    preconditions:
      "The session belongs to a customer, and `GET /orders` answers with two orders that have different statuses.",
    steps: [
      {
        action: "Open `/customer`.",
        expected: "The panel renders its loading placeholder while the request is in flight.",
      },
      {
        action: "Wait for the answers of `GET /orders`, `GET /categories` and `GET /users/executors/available`.",
        expected: "A card appears for each order, showing its title.",
      },
      {
        action: "Inspect the list region.",
        expected: "The loading placeholder and the empty state are gone, because orders are present.",
      },
    ],
  },
  {
    key: "web.orders-page.search-narrows-list",
    suite: ordersPageSuite,
    title: "narrows the rendered list to the typed search and restores it with the reset action",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "The filter helpers are covered on their own, but a customer meets them through the toolbar: typing has to " +
      "narrow the rendered list, an empty result has to explain itself instead of showing a bare list, and the reset " +
      "control has to bring every order back. The case exercises that loop on the mounted page, so a toolbar that " +
      "stops calling the filter, or a reset that clears the fields without resetting the list, fails here.",
    preconditions: "The customer panel is mounted with two orders whose titles differ.",
    steps: [
      {
        action: "Type a fragment of one order's title into the search field.",
        expected: "Only the matching order remains; the other card is gone.",
      },
      {
        action: "Replace the search with a fragment that no order contains.",
        expected: "The list is replaced by the `nothing found` state with a reset control.",
      },
      {
        action: "Press the reset control.",
        expected: "Both orders are rendered again and the `nothing found` state is gone.",
      },
    ],
  },
  {
    key: "web.orders-page.retry-after-failure",
    suite: ordersPageSuite,
    title: "offers a retry that recovers from a failed load without a reload",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "negative",
    description:
      "A failed load must not look like an empty account: the panel has to say that loading failed, report the reason " +
      "in the reader's language, and offer a retry that asks again. The case answers the first request with `503`, " +
      "then lets the retry succeed, which is the path a customer takes after a short outage. A panel that shows the " +
      "empty state, stays silent about the failure, or retries without refetching fails here.",
    preconditions: "`GET /orders` answers `503` on the first attempt and with the orders on every later one.",
    steps: [
      {
        action: "Open `/customer`.",
        expected: "The error block with the retry control replaces the list; no order card appears.",
      },
      {
        action: "Read the notification.",
        expected: "It reports an unavailable service in the reader's language, not a generic failure.",
      },
      {
        action: "Press the retry control while `GET /orders` succeeds.",
        expected: "The orders are rendered, the error block disappears, and the api received a second `GET /orders`.",
      },
    ],
  },
  {
    key: "web.executor-panel.claims-pool-order",
    suite: executorPanelSuite,
    title: "claims a pool order and moves it into the assigned group",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "Claiming is the executor's first action and the only one that takes work away from everybody else, so the " +
      "panel has to send the claim and then re-read the list instead of trusting the click. Without the reload the " +
      "order stays in the pool on screen while the server has already assigned it, and a second claim fails with a " +
      "conflict the executor cannot explain. The case mounts the panel, claims the only pool order and asserts both " +
      "the request and the regrouping.",
    preconditions:
      "The session belongs to an executor, and `GET /orders` lists one order in `WAITING_DISTRIBUTION` without an executor.",
    steps: [
      {
        action: "Open `/executor`.",
        expected: "The order is rendered inside the pool group and the assigned group is empty.",
      },
      {
        action: "Press `claim` on that order.",
        expected: "The panel sends `POST /orders/<id>/claim` and then asks for the list again.",
      },
      {
        action: "Inspect both groups once the list has reloaded.",
        expected: "The order is now inside the assigned group and gone from the pool.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
