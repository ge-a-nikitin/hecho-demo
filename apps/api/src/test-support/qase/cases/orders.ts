import type { QaseCase } from "../types.js";

const validationSuite = ["Orders", "Request validation"] as const;
const lifecycleSuite = ["Orders", "Lifecycle"] as const;
const distributionSuite = ["Orders", "Distribution"] as const;
const draftSuite = ["Orders", "Draft editing"] as const;
const estimatesSuite = ["Orders", "Estimates"] as const;
const acceptanceSuite = ["Orders", "Acceptance and cancellation"] as const;
const commentsSuite = ["Orders", "Comments"] as const;
const quotasSuite = ["Orders", "Quotas"] as const;

export const ordersCases = [
  {
    key: "orders.assign.restarts-started-work",
    suite: distributionSuite,
    title: "returns work in progress to the assignment stage for the new executor",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The administrator is the only role that can take work away from an executor after it started. The " +
      "order cannot jump straight back to work: a new executor has their own rate and their own estimate, so " +
      "the order returns to `ASSIGNED` with the approved hours, rate and amount cleared, while the previous " +
      "assignment and the accepted estimate stay in the history.",
    preconditions:
      "An order in `IN_PROGRESS` assigned to `executor-1` with an approved estimate of 2.5 hours at 60, one " +
      "`ACTIVE` assignment and one `ACCEPTED` estimate; `executor-2` is an active executor.",
    steps: [
      {
        action: "Assign the order to `executor-2` as the administrator.",
        expected:
          "The order is `ASSIGNED` to `executor-2` with `approvedHours`, `approvedHourlyRate` and " +
          "`approvedAmount` set to `null`.",
      },
      {
        action: "Read the assignment history.",
        expected:
          "The first assignment is `REASSIGNED` with an end date, and a new `ACTIVE` assignment names " +
          "`executor-2` and the administrator.",
      },
      {
        action: "Read the status history and the estimate.",
        expected:
          "One entry records `IN_PROGRESS` to `ASSIGNED` by the administrator, and the old estimate is still " +
          "`ACCEPTED`, so the new executor must propose a fresh one.",
      },
    ],
  },
  {
    key: "orders.assign.reassigns-with-history",
    suite: distributionSuite,
    title: "assigns a pooled order and moves a later reassignment into the history",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Distribution is auditable: the administrator assigns a pooled order, and a later reassignment does not " +
      "delete the first executor from the record. The estimate the first executor left behind is withdrawn " +
      "rather than deleted, and the reassignment is written as its own history entry.",
    preconditions:
      "An order in `WAITING_DISTRIBUTION` with one `PENDING` estimate, and two active executors.",
    steps: [
      {
        action: "Assign the order to `executor-1` as the administrator.",
        expected: "The order is `ASSIGNED` to `executor-1` with one `ACTIVE` assignment.",
      },
      {
        action: "Assign the same order to `executor-2`.",
        expected:
          "The order is `ASSIGNED` to `executor-2`, the first assignment is `REASSIGNED` with an end date and " +
          "a second `ACTIVE` assignment names the new executor.",
      },
      {
        action: "Read the estimate and the status history.",
        expected:
          "The pending estimate is `WITHDRAWN` with the note that the order was reassigned, and the history " +
          "holds both transitions plus the reassignment note.",
      },
    ],
  },
  {
    key: "orders.assign.requires-active-executor",
    suite: distributionSuite,
    title: "refuses an inactive executor, the current one and a closed order",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Assignment is the administrator's way to build the queue, so a deactivated account must never receive " +
      "new work and an order that is already closed must not be reopened by pointing it at someone. Naming the " +
      "current executor again is a conflict rather than a silent no-op.",
    preconditions:
      "An order in `WAITING_DISTRIBUTION`, one active and one inactive executor, and a completed order.",
    steps: [
      {
        action: "Assign the waiting order to the inactive executor and to a missing id.",
        expected: "Both calls answer `BadRequestException`.",
      },
      {
        action: "Assign it to the active executor, then to the same executor again.",
        expected: "The first call succeeds with one `ACTIVE` assignment; the second answers `ConflictException`.",
      },
      {
        action: "Assign the completed order to the active executor.",
        expected: "The call answers `ConflictException` and the closed order keeps its status.",
      },
    ],
  },
  {
    key: "orders.draft.update-fields",
    suite: draftSuite,
    title: "stores the edited draft with trimmed values and releases the executor the customer detaches",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A draft is the only state the customer may still change, and every change has to reach the stored row: " +
      "padded text is trimmed, an emptied optional field becomes null, and detaching the chosen executor ends " +
      "that assignment instead of leaving it `ACTIVE` on an order nobody owns.",
    preconditions:
      "A `NEW` draft assigned to `executor-1` with one `ACTIVE` assignment and an active category.",
    steps: [
      {
        action: "Edit the draft with a padded title, an emptied location, the category and `executorId: null`.",
        expected:
          "The stored order has the trimmed title, `location: null`, the category and `executorId: null`, and " +
          "is still `NEW`.",
      },
      {
        action: "Read the assignment history.",
        expected: "The single assignment is `RELEASED` with an end date.",
      },
    ],
  },
  {
    key: "orders.draft.refuses-invalid-edits",
    suite: draftSuite,
    title: "refuses to edit a submitted draft, another customer's order and an unavailable category",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The draft guard is the boundary between planning and execution: once the order is submitted the main " +
      "parameters are frozen, and an owner check keeps one customer out of another customer's draft. A retired " +
      "category is refused with a readable error rather than a foreign-key failure.",
    preconditions:
      "One `ASSIGNED` order, one `NEW` order of another customer, and one inactive category.",
    steps: [
      {
        action: "Edit the submitted order.",
        expected: "The call answers `ConflictException` and the order keeps its status.",
      },
      {
        action: "Edit the order of the other customer.",
        expected: "The call answers `ForbiddenException` and the owner stays unchanged.",
      },
      {
        action: "Move a draft to the inactive category.",
        expected: "The call answers `BadRequestException` and the draft keeps no category change.",
      },
    ],
  },
  {
    key: "orders.estimates.requires-rate",
    suite: estimatesSuite,
    title: "refuses an estimate from an executor without a positive hourly rate",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The amount is rate times hours, so a proposal without a rate has no amount at all. Refusing the call " +
      "keeps a zero-value estimate out of the customer's approval queue.",
    preconditions: "An `ASSIGNED` order whose executor has no hourly rate.",
    steps: [
      {
        action: "Propose two hours for the order.",
        expected: "The call answers `BadRequestException`.",
      },
      {
        action: "Read the estimate table.",
        expected: "No estimate row exists.",
      },
    ],
  },
  {
    key: "orders.estimates.amount-from-rate",
    suite: estimatesSuite,
    title: "multiplies the stored rate by the proposed hours and keeps the rate of the proposal",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The amount the customer approves is the one the invoice later snapshots, so the multiplication and its " +
      "rounding are part of the money contract. The rate is copied into the estimate at proposal time, which is " +
      "what keeps a later profile change from rewriting an accepted amount.",
    preconditions: "Two `ASSIGNED` orders by one executor whose rate is 45.5.",
    steps: [
      {
        action: "Propose 2.25 hours for the first order.",
        expected:
          "The estimate stores 2.25 hours, rate 45.5, amount 102.38 (45.5 x 2.25 rounded half up) and is " +
          "`PENDING`.",
      },
      {
        action: "Raise the executor's rate to 99 and propose one hour for the second order.",
        expected: "The new estimate stores rate 99.",
      },
      {
        action: "Read the first estimate again.",
        expected: "It still stores rate 45.5, so the accepted amount cannot drift with the profile.",
      },
    ],
  },
  {
    key: "orders.estimates.single-pending",
    suite: estimatesSuite,
    title: "answers conflict when a proposal is already waiting for the customer",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The customer approves one amount, so a second pending proposal would make the approval ambiguous and " +
      "leave an orphaned estimate in the history. The database enforces the rule with a unique index, and the " +
      "service turns that violation into a readable conflict instead of a server error.",
    preconditions: "An `ASSIGNED` order with an executor whose rate is set.",
    steps: [
      {
        action: "Propose two hours while the estimate insert raises the uniqueness violation.",
        expected: "The call answers `ConflictException`.",
      },
      {
        action: "Read the estimate table.",
        expected: "Neither proposal was stored.",
      },
    ],
  },
  {
    key: "orders.lifecycle.accept-once",
    suite: acceptanceSuite,
    title: "accepts the work once and refuses a second acceptance",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Acceptance is the customer's statement that the work is done, and it is what allows an invoice to be " +
      "issued. A second acceptance would rewrite the moment of agreement and add a second history entry, so the " +
      "call is refused and the stored acceptance stays untouched.",
    preconditions: "An order in `ON_REVIEW` without an acceptance, and the owning customer.",
    steps: [
      {
        action: "Accept the work.",
        expected: "The order keeps `ON_REVIEW` and records an `acceptedAt` date.",
      },
      {
        action: "Accept the same work again.",
        expected: "The call answers `ConflictException`.",
      },
      {
        action: "Read the status history.",
        expected: "Exactly one entry records the acceptance note.",
      },
    ],
  },
  {
    key: "orders.cancel.releases-assignment",
    suite: acceptanceSuite,
    title: "cancels a started assignment without a reason and withdraws the estimate awaiting the customer",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Before work starts a customer may walk away without explaining why, but the order must not be left in a " +
      "half-assigned state: the assignment ends and the estimate that still waits for the customer is withdrawn " +
      "so nobody can approve a plan for a cancelled order.",
    preconditions:
      "An `ASSIGNED` order with one `ACTIVE` assignment and one `PENDING` estimate, owned by the customer.",
    steps: [
      {
        action: "Cancel the order without a reason as the customer.",
        expected: "The order is `CANCELLED` with `cancellationReason: null`.",
      },
      {
        action: "Read the assignment and the estimate.",
        expected:
          "The assignment is `RELEASED` with an end date and the estimate is `WITHDRAWN` with the note that " +
          "the order was cancelled.",
      },
      {
        action: "Read the status history.",
        expected: "One entry records `ASSIGNED` to `CANCELLED` without a note.",
      },
    ],
  },
  {
    key: "orders.comments.participants-only",
    suite: commentsSuite,
    title: "records a comment from a participant and refuses an outsider",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The comment thread is the shared record of the job, so it has to accept the customer, the assigned " +
      "executor and the administrator, and nobody else. Storing the trimmed text keeps an accidental run of " +
      "spaces out of the timeline.",
    preconditions: "An order in `IN_PROGRESS` with `executor-1` assigned and a second customer.",
    steps: [
      {
        action: "Add a padded comment as the owning customer.",
        expected: "The stored comment carries the trimmed text and the customer as its author.",
      },
      {
        action: "Add a comment as the other customer.",
        expected: "The call answers `ForbiddenException`.",
      },
      {
        action: "Read the comment table.",
        expected: "Only the first comment exists.",
      },
    ],
  },
  {
    key: "orders.validation.whitespace-title",
    suite: validationSuite,
    title: "rejects required strings that contain only whitespace",
    severity: "normal",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The DTO trims every string before `@IsNotEmpty` runs, so `\"   \"` counts as a missing value rather " +
      "than a three-character title. Without that ordering the order list fills up with blank cards, and " +
      "the trimmed value is what the API stores anyway - validation has to agree with the stored form.",
    steps: [
      {
        action:
          "Validate a `CreateOrderDto` with `title: \"   \"`, a valid description and a category ID using " +
          "`class-validator`.",
        expected: "The result contains an error for `title` and no error for `description`.",
      },
    ],
  },
  {
    key: "orders.lifecycle.executor-list-scope",
    suite: lifecycleSuite,
    title: "shows every role only the orders it may see",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The order board is one endpoint for three audiences, so the scope has to come from the role: an " +
      "administrator sees everything, a customer sees only their own orders, and an executor sees the " +
      "work assigned to them plus the unassigned pool they may claim. A missing condition would hand one " +
      "customer another's order. The executor list also skips payment report joins, because receipts " +
      "belong to the customer and the administrator.",
    preconditions:
      "A fake database holding one order assigned to the executor, one unassigned waiting order with an " +
      "issued invoice and a receipt, one order assigned to another executor, and one personal draft.",
    steps: [
      {
        action: "Call `list` as the executor, as the customer who owns two of the orders, and as an administrator.",
        expected:
          "The executor receives the pool order and their own assignment, newest first; the customer " +
          "receives only their own orders; the administrator receives all four.",
      },
      {
        action: "Inspect the invoices attached to the pool order in the executor's response.",
        expected: "The invoice is present, but its `paymentReports` are not part of the payload.",
      },
    ],
  },
  {
    key: "orders.lifecycle.foreign-order-access",
    suite: lifecycleSuite,
    title: "rejects customers who try to access another customer's order",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Order detail is reachable by ID, so ownership is re-checked on read instead of trusting the caller. " +
      "A customer asking for someone else's order gets `403` - not a `404` with data attached and not a " +
      "silent success - which keeps one customer's address and photos out of another's session.",
    preconditions: "A stored order owned by `customer-2`.",
    steps: [
      {
        action: "Call `get(\"order-1\")` as `customer-1` with the `CUSTOMER` role.",
        expected: "The call rejects with `ForbiddenException` and returns no order payload.",
      },
    ],
  },
  {
    key: "orders.lifecycle.submit-to-pool",
    suite: lifecycleSuite,
    title: "submits unassigned drafts to the distribution pool and records the transition",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Submitting publishes a draft to the executors, which is the moment the customer loses control of " +
      "the order. The status change is a conditional `updateMany` on `status: NEW`, so a second click or a " +
      "parallel submit cannot publish twice, and the history row is written in the same transaction as " +
      "the transition.",
    preconditions: "A `NEW` order without an executor, owned by the calling customer.",
    steps: [
      {
        action: "Call `submit(\"order-1\")` as its customer.",
        expected:
          "The returned order is `WAITING_DISTRIBUTION`, and the stored row carries that status plus a " +
          "`submittedAt` date.",
      },
      {
        action: "Inspect the history written by the same call.",
        expected:
          "One `OrderStatusHistory` row records `changedById: customer-1`, `fromStatus: NEW` and " +
          "`toStatus: WAITING_DISTRIBUTION`.",
      },
    ],
  },
  {
    key: "orders.lifecycle.reject-estimate-comment",
    suite: lifecycleSuite,
    title: "requires a comment when a customer rejects an estimate",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A rejection without a reason leaves the executor guessing why the price was refused, so the API " +
      "refuses the request before it opens a transaction. Validating first keeps the failure cheap and " +
      "guarantees that no estimate or order row is touched by a request that cannot succeed.",
    preconditions: "An order with a pending estimate, owned by the calling customer.",
    steps: [
      {
        action: "Call `respondToEstimate` with `{ accepted: false }` and no comment.",
        expected: "The call rejects with `BadRequestException` and no transaction is started.",
      },
    ],
  },
  {
    key: "orders.lifecycle.cancel-after-invoice",
    suite: lifecycleSuite,
    title: "does not allow cancelling an invoiced order",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Once an invoice exists, cancelling the order would leave a document the customer already sees " +
      "without a matching job, and a paid invoice would become unrefundable bookkeeping noise. The case " +
      "runs for both blocked statuses - `INVOICE_ISSUED` and `INVOICE_PAID` - because the guard must cover " +
      "the whole invoiced tail of the lifecycle, not a single value.",
    preconditions: "An order whose invoice is already issued, and the same order once that invoice is paid.",
    steps: [
      {
        action: "Call `cancel` with the reason `\"No longer needed\"` as an administrator.",
        expected:
          "The call rejects with `ConflictException`; the order keeps its status and its cancellation " +
          "reason, and no history row is written.",
      },
    ],
  },
  {
    key: "orders.lifecycle.complete-requires-payment",
    suite: lifecycleSuite,
    title: "does not complete an order before payment is confirmed",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Completion closes the work and is the point where the executor's money becomes owed, so it must " +
      "require a fully paid invoice - not merely accepted work. The status guard rejects an order that has " +
      "not even reached invoicing before the invoice lookup runs, which keeps the failure cheap and the " +
      "message accurate.",
    preconditions:
      "An order in `ON_REVIEW` with no invoice, and an order in `INVOICE_PAID` whose only invoice is " +
      "still unpaid.",
    steps: [
      {
        action: "Call `complete` as an administrator for both orders.",
        expected:
          "Both calls reject with `ConflictException`; each order keeps its status and no history row is " +
          "written.",
      },
    ],
  },
  {
    key: "orders.lifecycle.complete-after-payment",
    suite: lifecycleSuite,
    title: "completes an order only after a paid invoice exists",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The happy path of closing an order: `INVOICE_PAID` plus a paid invoice becomes `COMPLETED`, the " +
      "completion timestamp is stamped and the transition is written to the history. Without that history " +
      "row the customer timeline would jump from paid to closed with no explanation.",
    preconditions: "An order in `INVOICE_PAID` with at least one paid invoice.",
    steps: [
      {
        action: "Call `complete` as an administrator.",
        expected:
          "The order returns as `COMPLETED`, and the stored row carries `status: COMPLETED` with a " +
          "`completedAt` date.",
      },
      {
        action: "Inspect the history written by the same call.",
        expected: "One row records `fromStatus: INVOICE_PAID` and `toStatus: COMPLETED`.",
      },
    ],
  },
  {
    key: "orders.validation.cancel-reason",
    suite: validationSuite,
    title: "keeps the cancellation reason optional but bounded",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Cancelling from the board must work in one click, so the reason cannot be required, but whatever " +
      "the customer writes ends up in the status history and in the notification email. The limit keeps " +
      "the stored reason renderable, and the string check rejects a number that the JSON body would " +
      "otherwise slip through.",
    steps: [
      {
        action: "Validate a body without `reason`, then a 2000-character reason and a 2001-character one.",
        expected: "The empty body and the 2000-character reason pass; the longer one reports an error.",
      },
      {
        action: "Validate `reason: 42`.",
        expected: "The result reports an error for `reason`.",
      },
    ],
  },
  {
    key: "orders.quotas.defaults",
    suite: quotasSuite,
    title: "keeps the documented quotas when nothing is configured",
    severity: "normal",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "Registration is open to any visitor by design, so the quotas are the only thing that stops a new " +
      "account from filling the volume that holds the database or from burying the board in orders. They " +
      "have to hold without any configuration, because an operator who forgets the variables must still " +
      "get the protection the documentation promises.",
    steps: [
      {
        action: "Resolve the quotas from an empty environment.",
        expected:
          "20 attachments per order, 100 attachments per account per day and 20 open orders per customer.",
      },
    ],
  },
  {
    key: "orders.quotas.environment",
    suite: quotasSuite,
    title: "reads the three quotas from the environment",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The right limits depend on the hosting: a training stand with a small disk can stay strict, while a " +
      "busy installation needs more room. Every quota is therefore a variable, and a value read here has to " +
      "reach the service unchanged, otherwise an operator raises a limit and the uploads keep failing.",
    steps: [
      {
        action:
          "Resolve the quotas from `ORDER_ATTACHMENT_LIMIT=5`, `ORDER_ATTACHMENT_DAILY_LIMIT=30` and " +
          "`ORDER_OPEN_LIMIT=3`.",
        expected: "The result carries exactly 5, 30 and 3.",
      },
    ],
  },
  {
    key: "orders.quotas.invalid",
    suite: quotasSuite,
    title: "refuses a quota it cannot read instead of ignoring the setting",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "A mistyped quota is worse than a missing one: `0` or `-1` would either block every upload or turn the " +
      "check into a no-op, and `many` would do the same through `NaN` comparisons. Failing at startup names " +
      "the variable, so the operator fixes the typo instead of shipping a stand without the control.",
    steps: [
      {
        action:
          "Resolve the quotas with `ORDER_ATTACHMENT_LIMIT=0`, then `ORDER_ATTACHMENT_DAILY_LIMIT=-1`, then " +
          "`ORDER_OPEN_LIMIT=many`.",
        expected: "Each call throws an error that names the offending variable.",
      },
    ],
  },
  {
    key: "orders.create.rejects-open-order-quota",
    suite: quotasSuite,
    title: "refuses a new order when the customer is at the open-order quota",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Each open order carries its own attachment budget and a place in the administrators' queue, so an " +
      "account that posts orders without end spends the shared disk and the operators' attention. The check " +
      "runs inside the creating transaction, before any row is written, so a refused order leaves nothing " +
      "behind for the board to show.",
    preconditions: "The customer already has two open orders and the quota is two.",
    steps: [
      {
        action: "Create an order for that customer.",
        expected:
          "The call answers `ConflictException`, and the database still holds exactly the two earlier orders.",
      },
    ],
  },
  {
    key: "orders.create.ignores-closed-orders",
    suite: quotasSuite,
    title: "does not count completed and cancelled orders against the quota",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Finished work is history, not load: a customer who has completed hundreds of orders must stay able to " +
      "open the next one. Only orders that still need attention count, which is why the quota filter excludes " +
      "`COMPLETED` and `CANCELLED` rather than counting every row of the table.",
    preconditions: "The customer has one completed and one cancelled order and the quota is one.",
    steps: [
      {
        action: "Create an order for that customer.",
        expected: "The order is created and the database holds three orders.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
