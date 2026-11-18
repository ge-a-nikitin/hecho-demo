import type { QaseCase } from "../types.js";

const ordersPageSuite = ["Web", "Orders page"] as const;
const executorPanelSuite = ["Web", "Executor panel"] as const;
const authenticationSuite = ["Web", "Authentication"] as const;

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
    key: "web.orders-page.estimate-figures",
    suite: ordersPageSuite,
    title: "shows the estimate hours and the amount together on the order card",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "The estimate is the moment a customer decides, and the card used to print the amount alone, so a tester read " +
      "`90` with no way to tell how much work it buys. The card now prints the hours and the price as one figure, and " +
      "the case mounts the panel with a pending estimate to assert the whole sentence a customer reads before " +
      "accepting or rejecting it.",
    preconditions:
      "The session belongs to a customer who owns an order with a `PENDING` estimate of two hours and ninety units.",
    steps: [
      {
        action: "Open `/customer` with one order whose estimate is pending.",
        expected: "The card offers the accept and reject controls for that estimate.",
      },
      {
        action: "Read the estimate line above the controls.",
        expected: "It prints the hours and the amount together, `2 h (90$)`, instead of the amount alone.",
      },
    ],
  },
  {
    key: "web.orders-page.attaches-files-on-create",
    suite: ordersPageSuite,
    title: "offers a file field in the create form and attaches the chosen files to the new draft",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "A customer describes the work with a photo or a PDF, and the order form is the only place that is open while " +
      "the order is being described, so a form without a file field leaves the customer with no way to hand the " +
      "executor the evidence at all. The api only accepts attachments on a draft, which fixes the order of the " +
      "calls: the draft has to exist before the upload, and the upload has to finish before the order is sent. " +
      "The case fills the form, chooses a file, submits and inspects both what the api received and in which order.",
    preconditions:
      "The session belongs to a customer; `POST /orders` answers with a draft, `POST /orders/<id>/attachments` accepts the file and `POST /orders/<id>/submit` sends the draft.",
    steps: [
      {
        action: "Open `/customer` and press `new order`.",
        expected: "The task form opens with a file field next to the description fields.",
      },
      {
        action: "Fill in the title and the description, choose a PNG file and press `create and send`.",
        expected:
          "The api receives `POST /orders`, then `POST /orders/<id>/attachments` carrying that file as multipart form data, then `POST /orders/<id>/submit`.",
      },
      {
        action: "Read the notification once the list has reloaded.",
        expected: "It reports that the order was sent for distribution.",
      },
    ],
  },
  {
    key: "web.auth.login-opens-workspace",
    suite: authenticationSuite,
    title: "opens the workspace of the signed-in user instead of returning to the login page",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "The authentication client keeps the last session it fetched in a store-wide atom, and the panel route reads " +
      "that atom the moment it mounts. Right after a sign-in the atom still holds the answer from before the login, " +
      "so a route that trusts it sends the visitor back to the login page, where nothing waits for the session: the " +
      "tester who reported the defect stayed on the form with valid credentials. The case mounts the real router and " +
      "the real form with a stub that keeps the stale atom and answers the server call with a customer, which is the " +
      "state the application is in immediately after signing in.",
    preconditions:
      "The session atom holds the pre-login answer, `signIn.email` accepts the credentials, and `getSession` answers with the session of a customer.",
    steps: [
      {
        action: "Open `/login` and submit the credentials of a customer.",
        expected: "The form reports no error and leaves the login page.",
      },
      {
        action: "Inspect the page the browser lands on.",
        expected: "The customer workspace is rendered with its orders region, not the login form.",
      },
      {
        action: "Inspect the address and the visible page again.",
        expected: "The panel stayed, because the route confirmed the session with the server instead of trusting the stale atom.",
      },
    ],
  },
  {
    key: "web.auth.signed-out-visits-login",
    suite: authenticationSuite,
    title: "sends a visitor without a session from a workspace to the login page",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "negative",
    description:
      "Waiting for the server before deciding who is signed in must not become a way into the workspace: a visitor " +
      "who holds no session cookie has to be sent to the login form, with the address they asked for kept so that the " +
      "form can return them to it. The case mounts a workspace route with a stub that answers both the atom and the " +
      "server call with `nobody`, so the redirect is the only correct outcome.",
    preconditions:
      "The session atom and `getSession` both report that nobody is signed in.",
    steps: [
      {
        action: "Open `/customer` without a session.",
        expected: "The login form is rendered.",
      },
      {
        action: "Inspect the workspace route.",
        expected: "No panel is mounted and no panel data is requested.",
      },
    ],
  },
  {
    key: "web.executor-panel.estimate-whole-hours",
    suite: executorPanelSuite,
    title: "steps the estimate hours by a whole hour and sends the number it shows",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "The estimate field is a number spinner, and its `step` is what one press of an arrow adds. A step copied from " +
      "a money field made every press move the value by `0.0001`, which a tester reported as hours that cannot be " +
      "raised to a plan at all: the number looked unchanged while the ratio applied to the hourly rate kept its four " +
      "decimal places. The case asserts the contract of the control and what the panel sends when the executor " +
      "proposes the hours the field shows.",
    preconditions:
      "The session belongs to an executor, and `GET /orders` lists one `ASSIGNED` order without a pending estimate.",
    steps: [
      {
        action: "Open `/executor` and read the estimate field of the assigned order.",
        expected: "The field steps by one and starts at one whole hour.",
      },
      {
        action: "Enter `3` and press `propose estimate`.",
        expected: "The api receives `POST /orders/<id>/estimate` with `{\"hours\":3}`.",
      },
    ],
  },
  {
    key: "web.executor-panel.estimate-figures",
    suite: executorPanelSuite,
    title: "shows the hours and the amount of the latest estimate on the assigned card",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "integration",
    behavior: "positive",
    description:
      "The executor watches the same estimate from the other side, and the assigned card printed only the amount. Two " +
      "roles read one number differently - the customer wants the price, the executor wants the workload - so the " +
      "case asserts that the card in the executor workspace carries the hours next to the amount as well, which is " +
      "the shared card the administrator sees too.",
    preconditions:
      "The session belongs to an executor, and `GET /orders` lists one `ASSIGNED` order with a `PENDING` estimate of two hours and ninety units.",
    steps: [
      {
        action: "Open `/executor`.",
        expected: "The order is rendered inside the assigned group with the estimate line.",
      },
      {
        action: "Read the estimate line.",
        expected: "It prints `2 h (90$)` and the status of the estimate, not the amount alone.",
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
