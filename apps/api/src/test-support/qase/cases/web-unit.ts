import type { QaseCase } from "../types.js";

const ordersListSuite = ["Web", "Orders list"] as const;
const apiClientSuite = ["Web", "API client"] as const;
const localizationSuite = ["Web", "Localization"] as const;
const motionSuite = ["Web", "Motion"] as const;

/**
 * Cases of the browser-side unit suite in apps/web.
 *
 * The layer stays `unit`, because TestOps offers only three of them and `e2e`
 * belongs to the Playwright suite in ge-a-nikitin/hecho-e2e, which drives a real
 * stack in a real browser. These cases never leave the process: the page-level
 * ones run in jsdom with the API mocked at the network boundary, so filing them
 * as `e2e` would claim coverage this repository does not provide. `type` carries
 * the distinction instead - `integration` marks a case that renders a whole page
 * behind the real router and providers.
 */
export const webUnitCases = [
  {
    key: "web.orders.filter-orders",
    suite: ordersListSuite,
    title: "narrows the list by status, category and a case-insensitive search",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Filtering runs in the browser, over the orders the customer already loaded, so a defect here hides work from " +
      "the person who owns it without any error: the list simply looks shorter. The search covers both the title and " +
      "the description, ignores leading and trailing spaces, and folds case with the locale of the interface, so a " +
      "Russian customer finds `Замена` by typing `замена` while a Turkish one keeps the dotted and dotless i apart.",
    steps: [
      {
        action: "Filter a list by `status`.",
        expected: "Only orders with exactly that status remain; an empty status keeps all of them.",
      },
      {
        action: "Filter the same list by `categoryId`.",
        expected: "Only orders of that category remain.",
      },
      {
        action: "Search for a fragment written in a different case, padded with spaces.",
        expected: "Orders whose title or description contains the fragment match, and the padding does not.",
      },
      {
        action: "Combine a status, a category and a search that no order satisfies.",
        expected: "The result is empty rather than the union of the individual matches.",
      },
    ],
  },
  {
    key: "web.orders.card-press",
    suite: ordersListSuite,
    title: "keeps the order card in place when it is pressed",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The order card is a container, not a control: the detail link, the action buttons and the draft form inside it " +
      "answer their own presses. A press transform on the card itself scales the whole card under the pointer, which " +
      "a tester reported as a card that `pumps` on every click, and on a long list it also makes the row under the " +
      "cursor shift while the click is still travelling to the control the person aimed at. The case reads the " +
      "stylesheet as the contract and asserts that the card carries no press state while the pointer feedback that " +
      "belongs to it stays.",
    steps: [
      {
        action: "Collect the rules of the order card from the stylesheet.",
        expected: "The card has a base rule and a hover rule, and no other state.",
      },
      {
        action: "Inspect the base rule for a transform and the state list for an `:active` rule.",
        expected: "Neither exists, so pressing the card moves nothing.",
      },
      {
        action: "Inspect the hover rule.",
        expected: "The card still answers the pointer with a border and a shadow, because only the press was wrong.",
      },
    ],
  },
  {
    key: "web.orders.category-options",
    suite: ordersListSuite,
    title: "lists every category once, sorted by the locale of the interface",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The category filter is built from the orders that are on screen, because the customer panel does not load the " +
      "category dictionary. A category used by ten orders must therefore appear once, and the options have to follow " +
      "the collation of the interface language instead of the byte order, otherwise a Russian customer reads a list " +
      "that looks unsorted.",
    steps: [
      {
        action: "Build the options from several orders that share two categories.",
        expected: "Each category appears exactly once, keeping its name.",
      },
      {
        action: "Sort the same orders with the `ru` locale.",
        expected: "The options follow Russian collation, not the order of the input.",
      },
    ],
  },
  {
    key: "web.orders.pagination",
    suite: ordersListSuite,
    title: "clamps the requested page to the range the list actually has",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The page number comes from the user, so it arrives out of range: a filter can shrink the list while page three " +
      "is open, and a hand-edited or restored state can ask for page zero. Slicing the array with an unclamped page " +
      "renders an empty screen with a non-zero total, which reads as a data loss rather than as a wrong page.",
    steps: [
      {
        action: "Paginate a list shorter than one page with page `1`.",
        expected: "One page holds every item and `totalPages` is `1`.",
      },
      {
        action: "Ask for a page below `1` or above `totalPages`.",
        expected: "The returned page is clamped, and the items are those of the clamped page.",
      },
      {
        action: "Paginate an empty list.",
        expected: "`totalPages` stays `1` instead of `0`, so the paginator never divides by zero.",
      },
    ],
  },
  {
    key: "web.orders.controls-reset",
    suite: ordersListSuite,
    title: "shows the reset action only while a filter is active",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The reset button is the only way out of a filter that hides the order a customer is looking for. Rendering it " +
      "always adds a control that does nothing, hiding it behind an active filter strands the user, and a search made " +
      "of spaces must not count as active, because that reads as a filter that matches nothing.",
    steps: [
      {
        action: "Render the controls with empty filters.",
        expected: "The search field and both selects are present and there is no reset action.",
      },
      {
        action: "Render them with a status chosen.",
        expected: "The reset action appears.",
      },
      {
        action: "Type a single space into the search field.",
        expected: "Nothing counts as an active filter, so the reset action stays hidden.",
      },
    ],
  },
  {
    key: "web.api.error-contract",
    suite: apiClientSuite,
    title: "turns a failed response into the status, the code and the message of the API",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Every panel shows failures through the same `ApiError`, and the localization picks the text by its code. A " +
      "mapping defect surfaces as the wrong message rather than as a crash: a validation error reported as an internal " +
      "one sends the user to support, and a missing code falls back to the status code so the interface still says " +
      "something precise.",
    steps: [
      {
        action: "Reject a request with `400` and a body that carries `message` and `code`.",
        expected: "`ApiError` exposes the status, the body code and the joined message.",
      },
      {
        action: "Reject a request with a status the body does not describe.",
        expected: "The code follows the status table, and the message falls back to the status text.",
      },
      {
        action: "Reject a request with a validation body whose `message` is an array.",
        expected: "The messages are joined instead of being rendered as `[object Object]`.",
      },
    ],
  },
  {
    key: "web.api.request-shape",
    suite: apiClientSuite,
    title: "sends JSON by default, reads `204` as empty and reports an unreachable server",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The client is the single place that knows about cookies, the content type and the empty body. A request sent " +
      "without credentials loses the session, a JSON body sent without its header is rejected by the API, and parsing " +
      "`204` as JSON throws on every delete and void operation, so those three rules are the contract every panel " +
      "relies on.",
    steps: [
      {
        action: "Send a request with a string body and no explicit content type.",
        expected: "The request carries `Content-Type: application/json` and `credentials: include`.",
      },
      {
        action: "Send a `FormData` body.",
        expected: "The content type is left to the browser, so the multipart boundary survives.",
      },
      {
        action: "Resolve a `204` response.",
        expected: "The call resolves with `undefined` instead of parsing an empty body.",
      },
      {
        action: "Make `fetch` reject with a transport error.",
        expected: "The caller receives `ApiError` with status `0` and code `NETWORK_ERROR`.",
      },
    ],
  },
  {
    key: "web.i18n.template",
    suite: localizationSuite,
    title: "fills in the placeholders it was given and leaves the rest untouched",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Messages are templates with `{name}`-style placeholders, and a wrong substitution shows raw braces or " +
      "`undefined` to the user. The formatter must also survive a missing parameter without emptying the sentence, " +
      "because a half-rendered message still tells more than a blank one.",
    steps: [
      {
        action: "Format a template with every placeholder supplied.",
        expected: "Each placeholder is replaced by its value, numbers included.",
      },
      {
        action: "Format a template with no parameters.",
        expected: "The template is returned unchanged.",
      },
      {
        action: "Format a template whose placeholder has no value.",
        expected: "That placeholder stays as written instead of becoming `undefined`.",
      },
    ],
  },
  {
    key: "web.i18n.plural",
    suite: localizationSuite,
    title: "picks the plural form of the interface locale and fills in the count",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Russian needs three forms and English two, so the choice has to come from `Intl.PluralRules` of the selected " +
      "locale rather than from an `n === 1` test. A form the catalogue does not carry must fall back to `other`, " +
      "otherwise a count of five renders an empty label.",
    steps: [
      {
        action: "Select the plural form for `1` and for `5` in English.",
        expected: "The first uses `one`, the second uses `other`, and `{count}` is filled in.",
      },
      {
        action: "Select the form for `2` and for `5` in Russian.",
        expected: "The first uses `few`, the second uses `many`.",
      },
      {
        action: "Select a form the catalogue omits.",
        expected: "The `other` form is used instead of an empty string.",
      },
    ],
  },
  {
    key: "web.i18n.error-message",
    suite: localizationSuite,
    title: "translates a failure by its code, by its status, or to the fallback",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "`errorMessage` is what the user reads when a panel fails, and it prefers the code the API sent over the bare " +
      "status. A defect shows a raw `ApiError` or an English string inside a Russian interface, so the precedence and " +
      "the fallback are pinned here rather than in each panel.",
    steps: [
      {
        action: "Translate an error that carries a code the catalogue knows.",
        expected: "The message of that code is returned.",
      },
      {
        action: "Translate an error that carries only a status.",
        expected: "The message of the code that status maps to is returned.",
      },
      {
        action: "Translate an unknown object and a plain `TypeError`.",
        expected: "The unknown object yields the caller's fallback, and `TypeError` yields the network message.",
      },
    ],
  },
  {
    key: "web.motion.rubberband",
    suite: motionSuite,
    title: "resists progressively the further a gesture is dragged past its limit",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The sheet is drag-only, so the resistance past the open position is the whole feedback that the gesture has " +
      "reached its limit. The curve has to grow with the drag but stay below it, or the sheet feels glued; it must be " +
      "odd in its input, so dragging back past the limit mirrors the movement instead of jumping.",
    steps: [
      {
        action: "Compute the offset for a small overshoot and for a larger one on the same dimension.",
        expected: "Both follow the pointer, and the larger overshoot yields the larger offset.",
      },
      {
        action: "Compute the offset for `+x` and for `-x`.",
        expected: "The two are exact mirrors.",
      },
      {
        action: "Compare the offset with the raw overshoot.",
        expected: "The offset is always smaller in magnitude, which is the resistance itself.",
      },
    ],
  },
  {
    key: "web.motion.release-velocity",
    suite: motionSuite,
    title: "reads the throw velocity from a pointer history and drops a stale one",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A released gesture keeps its momentum, so the sheet continues in the direction it was thrown. A history that " +
      "stopped moving before the release must read as zero, otherwise a sheet that was dragged and held still flies " +
      "away on release, and a single sample has no velocity at all.",
    steps: [
      {
        action: "Read the velocity of two samples moving down over 100 ms.",
        expected: "The result is positive and proportional to the distance over time.",
      },
      {
        action: "Read the velocity of a history whose last sample is older than 100 ms.",
        expected: "The result is `0`, because the pointer had come to rest.",
      },
      {
        action: "Read the velocity of zero or one sample.",
        expected: "The result is `0`.",
      },
    ],
  },
  {
    key: "web.motion.spring-settles",
    suite: motionSuite,
    title: "settles on its target and reports rest instead of oscillating forever",
    severity: "minor",
    priority: "low",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The integrator drives every animated surface. It must reach the target and stop emitting frames, because a " +
      "spring that never rests keeps a request-animation-frame loop alive and burns a phone battery on a screen that " +
      "looks still. A retarget during the run has to keep the current position, so the motion redirects instead of " +
      "jumping back.",
    steps: [
      {
        action: "Advance a spring from `0` towards `1` until it reports rest.",
        expected: "It converges to the target within the rest distance and then stops.",
      },
      {
        action: "Retarget the spring while it is in flight.",
        expected: "The next value continues from the current position, without a jump back to the start.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
