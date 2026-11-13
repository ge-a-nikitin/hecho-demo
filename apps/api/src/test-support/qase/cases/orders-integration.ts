import type { QaseCase } from "../types.js";

const lifecycleSuite = ["Orders (integration)", "Lifecycle"] as const;
const accessSuite = ["Orders (integration)", "Lifecycle", "Access control"] as const;
const validationSuite = ["Orders (integration)", "Lifecycle", "Request validation"] as const;
const quotaSuite = ["Orders (integration)", "Quotas"] as const;

/**
 * Every case in this file runs the same expensive setup, so the shared half of
 * the preconditions lives here instead of being repeated sixteen times.
 */
const stack =
  "The API and PostgreSQL are running and the database was reset for this run: one category exists, and " +
  "an administrator, two customers and two active executors with a positive hourly rate are signed in. ";

export const ordersIntegrationCases = [
  {
    key: "integration.lifecycle.create-draft",
    suite: lifecycleSuite,
    title: "creates a draft order for the current customer",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "A new order starts as a private draft: `NEW`, owned by the signed-in customer, without an executor " +
      "and without a deadline. The first history entry is written by the same transaction with a `null` " +
      "`fromStatus`, which is what the customer timeline renders as the creation event.",
    preconditions: stack + "No order has been created yet.",
    steps: [
      {
        action: "`POST /api/orders` with a title, a description and the existing category ID as the customer.",
        expected: "`201` and the created order in the response body.",
      },
      {
        action: "Inspect `status`, `customerId`, `executorId` and `categoryId` of that order.",
        expected: "`NEW`, the caller's ID, `null` and the requested category.",
      },
      {
        action: "Inspect `statusHistory`.",
        expected: "Exactly one entry, `fromStatus: null` and `toStatus: NEW`.",
      },
    ],
  },
  {
    key: "integration.lifecycle.unknown-category",
    suite: lifecycleSuite,
    title: "rejects a draft that references an unavailable category",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "negative",
    description:
      "A category can be deactivated or deleted between page load and submit, so the reference is checked " +
      "in the database rather than trusted from the form. The rejection is a `400` with the readable " +
      "message the web form shows next to the category picker, not a foreign-key `500`.",
    preconditions: stack,
    steps: [
      {
        action: "Prepare a `categoryId` that matches no category: a random UUID.",
        expected: "The value is syntactically valid, so the request reaches the service instead of the DTO.",
      },
      {
        action: "`POST /api/orders` as the customer with that category.",
        expected: "`400` with `code: BAD_REQUEST`.",
      },
      {
        action: "Read the error message.",
        expected: "`Category is not available`, the text the web form shows next to the category picker.",
      },
    ],
  },
  {
    key: "integration.lifecycle.submit-to-pool",
    suite: lifecycleSuite,
    title: "moves a submitted draft into the executor pool",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "Submitting is the transition from a private draft to a claimable job. The order keeps no executor " +
      "while it waits in the pool, gets a submission timestamp, and the history shows both statuses so the " +
      "customer can see when the job was published.",
    preconditions: stack + "A draft order (`NEW`) owned by the customer.",
    steps: [
      {
        action: "`POST /api/orders/{id}/submit` as the owning customer.",
        expected: "`201` with the updated order.",
      },
      {
        action: "Inspect `status`, `executorId` and `submittedAt`.",
        expected: "`WAITING_DISTRIBUTION`, `null` and a non-null submission timestamp.",
      },
      {
        action: "Inspect `statusHistory`.",
        expected: "The entries are `NEW` and `WAITING_DISTRIBUTION`, in that order.",
      },
    ],
  },
  {
    key: "integration.lifecycle.concurrent-claim",
    suite: lifecycleSuite,
    title: "grants a pooled order to exactly one of two concurrent claims",
    severity: "blocker",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "Two executors can tap the same pooled order at the same moment, and the row-level conditional " +
      "update has to make that race safe: one claim wins, the other is refused with `409`, and the database " +
      "ends with a single assignment and a single `ASSIGNED` history entry. A double assignment would bill " +
      "two executors for one job.",
    preconditions: stack + "A submitted order waiting in the distribution pool.",
    steps: [
      {
        action: "Fire `POST /api/orders/{id}/claim` as two executors at the same time via `Promise.all`.",
        expected: "Both requests reach the API with the same order ID before either finishes.",
      },
      {
        action: "Compare the two responses.",
        expected:
          "Exactly one is `201` with `executorId` set to the winner; the other is `409` with " +
          "`code: CONFLICT` and the message `Order is no longer available in the pool`.",
      },
      {
        action: "Read the order back as the customer.",
        expected:
          "`status: ASSIGNED`, exactly one entry in `assignments`, and exactly one `ASSIGNED` entry in " +
          "`statusHistory`.",
      },
    ],
  },
  {
    key: "integration.lifecycle.accept-estimate",
    suite: lifecycleSuite,
    title: "accepts an estimate and drives the order to customer acceptance",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "The core money path: the executor prices the job, the customer accepts, work starts, the executor " +
      "logs time and submits for review, and the customer accepts the result. Each step must leave the " +
      "order in the next status and keep the estimate amount derived from `hours * hourlyRate`.",
    preconditions: stack + "A draft order assigned to the executor.",
    steps: [
      {
        action: "`POST /api/orders/{id}/estimate` as the assigned executor with `hours: 2.5`.",
        expected:
          "`201` with a `PENDING` estimate whose amount equals `2.5 * 60`.",
      },
      {
        action: "`POST /api/orders/{id}/estimates/{estimateId}/respond` as the customer with " +
          "`accepted: true` and a comment.",
        expected: "The estimate becomes `ACCEPTED` and the order becomes `IN_PROGRESS`.",
      },
      {
        action: "Log `150` minutes via `POST /api/orders/{id}/time`, then submit for review via " +
          "`POST /api/orders/{id}/submit-review` as the executor.",
        expected:
          "The order becomes `ON_REVIEW` and carries `timeEntry.minutes: 150`.",
      },
      {
        action: "`POST /api/orders/{id}/accept` as the customer.",
        expected:
          "`201` with `status` still `ON_REVIEW` and a non-null `acceptedAt`, which is what unlocks invoicing.",
      },
    ],
  },
  {
    key: "integration.lifecycle.revision",
    suite: lifecycleSuite,
    title: "returns work for revision and lets the executor resume it",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "Review is not always acceptance. The customer can send the work back with a comment, the order " +
      "becomes `NEEDS_REVISION`, and the comment is stored in the order thread so the executor knows what " +
      "to change. The executor then resumes the same order instead of the customer creating a new one.",
    preconditions: stack + "An order in `IN_PROGRESS` assigned to the executor.",
    steps: [
      {
        action: "`POST /api/orders/{id}/submit-review` as the executor.",
        expected: "The order becomes `ON_REVIEW`.",
      },
      {
        action: "`POST /api/orders/{id}/request-revision` as the customer with a comment.",
        expected:
          "The order becomes `NEEDS_REVISION` and the comment appears in the order `comments`.",
      },
      {
        action: "`POST /api/orders/{id}/resume-revisions` as the executor.",
        expected: "The order returns to `IN_PROGRESS`.",
      },
    ],
  },
  {
    key: "integration.lifecycle.reject-estimate",
    suite: lifecycleSuite,
    title: "rejects an estimate and returns the order to the pool",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "A rejected price must not strand the order with an executor who will not do the job. The estimate " +
      "becomes `REJECTED`, the assignment is closed as `RELEASED`, and the order goes back to the pool so " +
      "another executor can quote it.",
    preconditions: stack + "A draft order assigned to the executor with a pending estimate.",
    steps: [
      {
        action: "`POST /api/orders/{id}/estimate` as the executor with `hours: 4`.",
        expected: "`201` with a `PENDING` estimate.",
      },
      {
        action: "`POST /api/orders/{id}/estimates/{estimateId}/respond` as the customer with " +
          "`accepted: false` and the comment `Too expensive`.",
        expected:
          "The estimate becomes `REJECTED` and the order returns to `WAITING_DISTRIBUTION` with " +
          "`executorId: null`.",
      },
      {
        action: "Inspect the assignment of the rejected executor.",
        expected: "It records `outcome: RELEASED`.",
      },
    ],
  },
  {
    key: "integration.lifecycle.cancel-reason",
    suite: lifecycleSuite,
    title: "requires a reason when an administrator cancels work in progress",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "negative",
    description:
      "After the work has started, cancelling is an administrative action that needs a written reason: the " +
      "customer can no longer do it themselves, and the executor must be able to see why the job stopped. " +
      "The reason is stored on the order and shown in the history.",
    preconditions: stack + "An order in `IN_PROGRESS` assigned to the executor.",
    steps: [
      {
        action: "`POST /api/orders/{id}/cancel` as the customer with a reason.",
        expected:
          "`403` with `code: FORBIDDEN` and the message `Customers can cancel only their own orders before " +
          "work starts`.",
      },
      {
        action: "`POST /api/orders/{id}/cancel` as the administrator without a body.",
        expected:
          "`400` with `code: BAD_REQUEST` and the message `A cancellation reason is required after work has " +
          "started`.",
      },
      {
        action: "Repeat the administrative cancel with `{\"reason\": \"The customer changed plans\"}`.",
        expected:
          "`201` with `status: CANCELLED` and `cancellationReason` equal to the submitted text.",
      },
    ],
  },
  {
    key: "integration.access-control.no-session",
    suite: accessSuite,
    title: "rejects requests without a session",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "negative",
    description:
      "Every order route sits behind the session guard, and an anonymous request must be refused before " +
      "any query runs. The `401` with `code: UNAUTHENTICATED` is what makes the web client redirect to the " +
      "sign-in page instead of showing an empty list.",
    preconditions: stack,
    steps: [
      {
        action: "Use an HTTP client without the session cookie.",
        expected: "The request carries no credentials at all.",
      },
      {
        action: "`GET /api/orders`.",
        expected: "The session guard rejects the request before any order query runs.",
      },
      {
        action: "Inspect the response.",
        expected: "`401` with `code: UNAUTHENTICATED` and no order data.",
      },
    ],
  },
  {
    key: "integration.access-control.foreign-order",
    suite: accessSuite,
    title: "hides a customer order from another customer",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "negative",
    description:
      "Order IDs are not secrets, so access is enforced per request: another customer's order answers " +
      "`403` and never appears in the attacker's list. Both halves matter - a detail endpoint that leaks " +
      "and a list that still shows the row would be equally fatal.",
    preconditions: stack + "A draft order owned by the first customer.",
    steps: [
      {
        action: "`GET /api/orders/{id}` as the second customer.",
        expected: "`403` with `code: FORBIDDEN`.",
      },
      {
        action: "Read the error message.",
        expected:
          "`You cannot access this order` - the body reveals neither the title nor the address of the order.",
      },
      {
        action: "`GET /api/orders` as the second customer.",
        expected: "The foreign order ID is absent from the returned list.",
      },
    ],
  },
  {
    key: "integration.access-control.pool-visibility",
    suite: accessSuite,
    title: "shows a pooled order to executors and hides it once it is claimed",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "positive",
    description:
      "A pooled order is visible to every executor so they can decide whether to claim it, and invisible " +
      "as soon as somebody else takes it. Without the second half an executor could keep reading a job - " +
      "including the customer's address - that is no longer theirs.",
    preconditions: stack + "A submitted order waiting in the distribution pool.",
    steps: [
      {
        action: "`GET /api/orders/{id}` as the first executor.",
        expected: "`200` with `status: WAITING_DISTRIBUTION`.",
      },
      {
        action: "`POST /api/orders/{id}/claim` as the second executor.",
        expected: "`201`, the order is now assigned to the second executor.",
      },
      {
        action: "`GET /api/orders/{id}` as the first executor again.",
        expected: "`403`, because the order left the pool.",
      },
    ],
  },
  {
    key: "integration.access-control.executor-create",
    suite: accessSuite,
    title: "refuses order creation for an executor",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "negative",
    description:
      "Executors work on orders, they do not commission them. The role check rejects the request with a " +
      "`403` before validation runs, so an executor cannot probe the DTO rules or create jobs to bill " +
      "themselves for.",
    preconditions: stack,
    steps: [
      {
        action: "Sign in as an executor.",
        expected: "The session carries the `EXECUTOR` role.",
      },
      {
        action: "`POST /api/orders` with a valid-looking body.",
        expected: "The role guard rejects the request before the DTO rules are evaluated.",
      },
      {
        action: "Inspect the response.",
        expected:
          "`403` with `code: FORBIDDEN` and the message `This role cannot access the requested resource`.",
      },
    ],
  },
  {
    key: "integration.access-control.customer-complete",
    suite: accessSuite,
    title: "refuses administrative completion for a customer",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "negative",
    description:
      "Completing an order releases the executor's payment, so the endpoint is administrator-only even " +
      "for the customer who owns the order. The refusal happens on the role check, which keeps the payment " +
      "gate independent from the ownership check.",
    preconditions: stack + "A draft order owned by the customer.",
    steps: [
      {
        action: "Sign in as the customer who owns the order.",
        expected: "Ownership alone does not grant administrative actions.",
      },
      {
        action: "`POST /api/orders/{id}/complete` as that customer.",
        expected: "The role check refuses the request before the payment gate runs.",
      },
      {
        action: "Inspect the response.",
        expected: "`403` with `code: FORBIDDEN`; the order status is unchanged.",
      },
    ],
  },
  {
    key: "integration.validation.unknown-fields",
    suite: validationSuite,
    title: "rejects unknown fields instead of ignoring them",
    severity: "major",
    priority: "medium",
    layer: "api",
    type: "functional",
    behavior: "negative",
    description:
      "The global validation pipe forbids unknown properties, so a client that sends `priority` today gets " +
      "a `400` instead of a silent `201` whose value was dropped. That turns a renamed or mistyped field " +
      "into an immediate client error rather than a data inconsistency discovered later.",
    preconditions: stack,
    steps: [
      {
        action: "`POST /api/orders` as the customer with the extra field `priority: \"urgent\"`.",
        expected: "The global validation pipe inspects the payload before the service runs.",
      },
      {
        action: "Inspect the response status.",
        expected: "`400` with `code: BAD_REQUEST`, not a `201` that silently dropped the field.",
      },
      {
        action: "Inspect the message list.",
        expected: "It contains `property priority should not exist`.",
      },
    ],
  },
  {
    key: "integration.validation.whitespace-title",
    suite: validationSuite,
    title: "rejects a title that contains only whitespace",
    severity: "normal",
    priority: "medium",
    layer: "api",
    type: "functional",
    behavior: "negative",
    description:
      "The unit case checks the DTO in isolation; this one proves the pipe injected by the application " +
      "actually runs it, trimming and then rejecting the blank title over real HTTP. A misconfigured pipe " +
      "would only show up here.",
    preconditions: stack,
    steps: [
      {
        action: "`POST /api/orders` as the customer with `title: \"   \"`.",
        expected: "The pipe trims the title to an empty string before the checks run.",
      },
      {
        action: "Inspect the response status.",
        expected: "`400`; no order is created.",
      },
      {
        action: "Inspect the message list.",
        expected: "At least one message names `title`.",
      },
    ],
  },
  {
    key: "integration.validation.deadline-format",
    suite: validationSuite,
    title: "rejects a deadline that is not an ISO-8601 date",
    severity: "normal",
    priority: "medium",
    layer: "api",
    type: "functional",
    behavior: "negative",
    description:
      "`dueAt` is stored as a timestamp, and a free-form value such as `tomorrow` would either throw inside " +
      "Prisma or, worse, be coerced to an arbitrary date. The pipe rejects it up front and names the field " +
      "so the client can highlight the deadline input.",
    preconditions: stack,
    steps: [
      {
        action: "`POST /api/orders` as the customer with `dueAt: \"tomorrow\"`.",
        expected: "The value cannot be parsed as an ISO-8601 timestamp.",
      },
      {
        action: "Inspect the response status.",
        expected: "`400`; the request never reaches Prisma.",
      },
      {
        action: "Inspect the message list.",
        expected: "At least one message names `dueAt`.",
      },
    ],
  },
  {
    key: "integration.quota.attachment-limit",
    suite: quotaSuite,
    title: "accepts the attachments up to the order quota and answers the next one with a 409",
    severity: "major",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "negative",
    description:
      "The quota is the only thing that stands between an open registration and a full volume, so it has to " +
      "hold end to end: the files that fit are stored, and the one that does not is refused before it lands " +
      "in SeaweedFS. It also pins the shape of the refusal - `409` rather than `400` or `413` - so the " +
      "frontend can tell a full order from a malformed request, and the order keeps exactly the attachments " +
      "the API accepted.",
    preconditions:
      "The ephemeral stack runs with `ORDER_ATTACHMENT_LIMIT=3`, and a customer owns an order without " +
      "attachments.",
    steps: [
      {
        action: "Upload three 1-pixel PNG files to the order as that customer.",
        expected: "Every call answers `201` with the stored attachment.",
      },
      {
        action: "Upload a fourth file.",
        expected: "The call answers `409`.",
      },
      {
        action: "Read the order.",
        expected: "It lists exactly the three accepted file names.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
