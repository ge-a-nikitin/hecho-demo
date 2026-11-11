import type { QaseCase } from "../types.js";

const paymentSuite = ["Invoices", "Payment reports"] as const;

export const invoicesCases = [
  {
    key: "invoices.payment-reports.receipt-stored",
    suite: paymentSuite,
    title: "stores a customer receipt without marking the invoice paid or completing the order",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A receipt is a claim, not a payment: the customer uploads proof of transfer and an administrator " +
      "decides later. Storing the upload must therefore leave the invoice `ISSUED` and the order " +
      "`INVOICE_ISSUED`, otherwise a customer could close their own order by uploading a file.",
    preconditions:
      "An invoice in `ISSUED` for an order in `INVOICE_ISSUED`, owned by the acting customer, with an " +
      "empty object storage stub.",
    steps: [
      {
        action: "Call `reportPayment` with a 7-byte `receipt.txt` upload as the owning customer.",
        expected:
          "The file is written to the generated object key, and the created `InvoicePaymentReport` is " +
          "`PENDING` with `submittedById: customer-1` and that object key.",
      },
      {
        action: "Check the side effects of the same call on the invoice and the order.",
        expected:
          "No invoice update and no order status update is issued: the invoice stays `ISSUED` and the " +
          "order stays `INVOICE_ISSUED`.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.confirm-payment",
    suite: paymentSuite,
    title: "confirms payment and moves the order to INVOICE_PAID without completing it",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Confirming a report is the administrator's decision that money arrived. It flips the report to " +
      "`CONFIRMED`, marks the invoice `PAID` and moves the order to `INVOICE_PAID` - deliberately stopping " +
      "there, because closing the job is a separate administrative step that also pays the executor.",
    preconditions: "A `PENDING` payment report on an `ISSUED` invoice, and an acting administrator.",
    steps: [
      {
        action: "Call `confirmPaymentReport` as an administrator.",
        expected:
          "The returned invoice is `PAID`, the report update sets `status: CONFIRMED` and " +
          "`reviewedById: admin-1`.",
      },
      {
        action: "Inspect the order update and the history written by the same call.",
        expected:
          "The order becomes `INVOICE_PAID` with no `completedAt`, and one history row records " +
          "`toStatus: INVOICE_PAID`.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.executor-denied",
    suite: paymentSuite,
    title: "does not allow executors to read customer payment receipts",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "Bank receipts carry the customer's account details, so only the owning customer and administrators " +
      "may download them. The permission check runs before the storage read: a denied request must not even " +
      "open the object, which is why the assertion covers the storage stub as well as the exception.",
    preconditions: "A stored receipt on an order that belongs to `customer-1`.",
    steps: [
      {
        action: "Call `paymentReportFile` as a user with the `EXECUTOR` role.",
        expected: "The call rejects with `ForbiddenException` and object storage is never read.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
