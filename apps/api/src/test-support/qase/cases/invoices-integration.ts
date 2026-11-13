import type { QaseCase } from "../types.js";

const issuingSuite = ["Invoices (integration)", "Issuing"] as const;
const voidingSuite = ["Invoices (integration)", "Voiding"] as const;
const reviewSuite = ["Invoices (integration)", "Payment review"] as const;
const completionSuite = ["Invoices (integration)", "Completion"] as const;
const documentsSuite = ["Invoices (integration)", "Documents"] as const;

/**
 * The invoice cases share one expensive setup, so the common half of the
 * preconditions is stated once: a reset database, an administrator, a customer,
 * a second customer and an assigned executor whose rate is 60 per hour.
 */
const stack =
  "The API, PostgreSQL and SeaweedFS are running and the database was reset for this run: one category exists, " +
  "and an administrator, two customers and an executor with a 60-per-hour rate are signed in. ";

export const invoicesIntegrationCases = [
  {
    key: "integration.invoices.numbering",
    suite: issuingSuite,
    title: "numbers issued invoices sequentially and snapshots the accepted work",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "The invoice number is the only identifier a customer quotes when paying, so it must be unique, " +
      "sequential within the year and derived from a counter that survives concurrent issues. The case also " +
      "pins the snapshot: names, hours, rate and amount come from the accepted estimate and must not follow a " +
      "later profile change.",
    preconditions:
      stack + "Two orders were driven to accepted work: 2.5 hours at 60 per hour, approved by the customer.",
    steps: [
      {
        action: "Issue an invoice for the first order as the administrator.",
        expected:
          "`201` with a number matching `INV-<current year>-NNNNNN`, status `ISSUED`, the customer and " +
          "executor names, 2.5 hours, rate 60 and amount 150.",
      },
      {
        action: "Issue an invoice for the second order.",
        expected: "The sequence segment is exactly one greater than the previous invoice.",
      },
      {
        action: "Read the first order as its customer.",
        expected:
          "The order is `INVOICE_ISSUED`, carries exactly one invoice, and its last history entry names that " +
          "invoice number.",
      },
    ],
  },
  {
    key: "integration.invoices.one-active",
    suite: issuingSuite,
    title: "refuses a second active invoice for the same order",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "negative",
    description:
      "Two payable documents for one job would double the amount the customer is asked to transfer. The order " +
      "may carry any number of voided invoices, but only one that still awaits payment, and a second issue is " +
      "refused instead of overwriting the first.",
    preconditions: stack + "An order with one issued invoice.",
    steps: [
      {
        action: "Issue an invoice for the order again as the administrator.",
        expected: "`409` with `code: CONFLICT` and the message about an already active invoice.",
      },
      {
        action: "Read the order as its customer.",
        expected: "It still carries exactly one invoice, the original one, and that invoice is `ISSUED`.",
      },
      {
        action: "Inspect the invoice array of the order response.",
        expected: "The list has one entry whose id and number match the first issue, with no second document.",
      },
    ],
  },
  {
    key: "integration.invoices.void-and-reissue",
    suite: voidingSuite,
    title: "voids an unpaid invoice with a reason and reissues it under a new number",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "A wrong amount has to be correctable without deleting an invoice: voiding preserves the number, the " +
      "reason and the administrator, keeps the order in `INVOICE_ISSUED`, and the replacement invoice takes the " +
      "next number of the same year instead of reusing the voided one.",
    preconditions: stack + "An order with one issued invoice.",
    steps: [
      {
        action: "Void the invoice as the administrator with the reason `\"Amount was miscalculated\"`.",
        expected:
          "`201` with status `VOID`, that reason, `voidedById` of the administrator and a void date.",
      },
      {
        action: "Issue a replacement invoice for the same order.",
        expected:
          "`201` with a different invoice id and a greater sequence segment than the voided invoice.",
      },
      {
        action: "Read the order as its customer.",
        expected:
          "The order is still `INVOICE_ISSUED` and lists two invoices in creation order: the voided one with " +
          "its original number, then the new one `ISSUED`.",
      },
    ],
  },
  {
    key: "integration.invoices.void-after-payment",
    suite: voidingSuite,
    title: "refuses to void an invoice after the customer has paid it",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "negative",
    description:
      "A paid invoice is the record of money that arrived. Allowing a void after confirmation would erase the " +
      "only document proving the payment and reopen a closed order, so the administrator is refused and the " +
      "invoice keeps its payment date.",
    preconditions:
      stack + "An order whose invoice was paid through a receipt and an administrator confirmation.",
    steps: [
      {
        action: "Void the paid invoice with a reason as the administrator.",
        expected: "`409` with `code: CONFLICT`.",
      },
      {
        action: "Read the invoice in the order as the customer.",
        expected: "It is still `PAID` with its `paidAt` date and without a void date or reason.",
      },
      {
        action: "Read the order status.",
        expected: "The order is still `INVOICE_PAID`, so the payment cannot be undone by voiding.",
      },
    ],
  },
  {
    key: "integration.invoices.receipt-cycle",
    suite: reviewSuite,
    title: "reviews a receipt, accepts a new upload after a rejection and marks the invoice paid",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "The receipt loop is the only payment path in the product: the customer claims a transfer, the " +
      "administrator either refuses it with a reason or confirms it. A rejection has to leave room for another " +
      "upload while keeping the refused one in the history, and a confirmation must pay the invoice without " +
      "completing the order.",
    preconditions: stack + "An order in `INVOICE_ISSUED` with an issued invoice and no receipts yet.",
    steps: [
      {
        action: "Upload a PDF receipt named `first-receipt.pdf` as the customer.",
        expected: "`201` with status `PENDING`; the invoice stays `ISSUED` and the order `INVOICE_ISSUED`.",
      },
      {
        action:
          "Reject that receipt as the administrator with the reason `\"The receipt does not show the transfer date\"`.",
        expected: "`201` with status `REJECTED` and that reason in `reviewComment`.",
      },
      {
        action: "Upload a second receipt and confirm it as the administrator.",
        expected:
          "The upload is `201` again, the confirmation answers `201` with the invoice `PAID` and `paidAt`.",
      },
      {
        action: "Read the order as the customer.",
        expected:
          "The order is `INVOICE_PAID` with no `completedAt`, and the invoice lists both reports, the confirmed " +
          "one first and the rejected one second.",
      },
    ],
  },
  {
    key: "integration.invoices.receipt-access",
    suite: reviewSuite,
    title: "keeps the receipt away from the executor and serves it to the administrator as a download",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "security",
    behavior: "negative",
    description:
      "A bank receipt carries the customer's account details, so the executor who did the work must not read " +
      "it even though they see the invoice itself. The download is served as `application/octet-stream` with an " +
      "attachment disposition, which is what stops the browser from rendering the document in the API origin.",
    preconditions: stack + "An issued invoice with one pending receipt uploaded by the owning customer.",
    steps: [
      {
        action: "Download the receipt as the executor assigned to the order.",
        expected: "`403` with `code: FORBIDDEN`.",
      },
      {
        action: "Download the receipt as a different customer.",
        expected: "`403` with `code: FORBIDDEN`.",
      },
      {
        action: "Download the receipt as the administrator and as the owning customer.",
        expected:
          "Both answer `200` with `content-type: application/octet-stream`, an attachment disposition and the " +
          "uploaded bytes.",
      },
    ],
  },
  {
    key: "integration.invoices.complete-after-payment",
    suite: completionSuite,
    title: "completes a paid order once and refuses the second completion",
    severity: "critical",
    priority: "high",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "Completion is a separate administrative action after the money arrived, and it stamps `completedAt` " +
      "exactly once. A second call must not move the timestamp or write another history row, because the " +
      "order's closure is what reports and statistics read.",
    preconditions: stack + "An order in `INVOICE_PAID` with a confirmed payment.",
    steps: [
      {
        action: "Complete the order as the administrator.",
        expected: "`201` with status `COMPLETED` and a `completedAt` timestamp.",
      },
      {
        action: "Complete the same order again.",
        expected: "`409` with `code: CONFLICT`.",
      },
      {
        action: "Read the order as the customer.",
        expected: "The order is `COMPLETED` and its last history entry records `INVOICE_PAID` to `COMPLETED`.",
      },
    ],
  },
  {
    key: "integration.invoices.pdf-stream",
    suite: documentsSuite,
    title: "serves the invoice PDF to the participants and hides it from another customer",
    severity: "major",
    priority: "medium",
    layer: "api",
    type: "functional",
    behavior: "positive",
    description:
      "The PDF is generated from the stored snapshot, so it has to be reachable for the customer who pays and " +
      "the executor who reads the amount, and unreachable for a customer who has no relation to the order. The " +
      "case pins the transport: `application/pdf`, an attachment disposition and a real PDF header, because the " +
      "document body is a compressed stream and cannot be read back field by field.",
    preconditions: stack + "An order in `INVOICE_ISSUED` with one issued invoice.",
    steps: [
      {
        action: "Download the invoice PDF as the owning customer.",
        expected:
          "`200` with `content-type: application/pdf`, an attachment disposition and a body starting with " +
          "`%PDF-` that is larger than a stub.",
      },
      {
        action: "Download the same PDF as the assigned executor.",
        expected: "`200` as well, because the executor sees the invoice amounts.",
      },
      {
        action: "Download the same PDF as another customer.",
        expected: "`403`, because the order is not visible to that account.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
