import type { QaseCase } from "../types.js";

const paymentSuite = ["Invoices", "Payment reports"] as const;
const validationSuite = ["Invoices", "Request validation"] as const;

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
          "The file is written to the generated object key, and the stored `InvoicePaymentReport` is " +
          "`PENDING` with `submittedById: customer-1`, that object key, `contentType: text/plain` and " +
          "`sizeBytes: 7`.",
      },
      {
        action: "Check the state of the invoice and the order after the same call.",
        expected:
          "The invoice is still `ISSUED` and the order still `INVOICE_ISSUED` with no `completedAt`, so " +
          "an upload cannot close the job.",
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
          "The returned invoice is `PAID`, the stored report is `CONFIRMED` with `reviewedById: admin-1` " +
          "and a review date, and the invoice row is `PAID` with a `paidAt` date.",
      },
      {
        action: "Inspect the order and the history written by the same call.",
        expected:
          "The order is stored as `INVOICE_PAID` with no `completedAt`, and one history row records " +
          "`INVOICE_ISSUED` to `INVOICE_PAID` with the invoice number in its note.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.duplicate-guard",
    suite: paymentSuite,
    title: "refuses a second receipt while one is awaiting review",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "An administrator reviews one receipt per invoice, so a second pending report would make the " +
      "decision ambiguous and both uploads would race for the same confirmation. The guard runs inside " +
      "the transaction, after the upload, which is why the refused file has to leave the bucket again " +
      "instead of lingering as an orphan.",
    preconditions:
      "An invoice in `ISSUED` for an order in `INVOICE_ISSUED` that already carries one `PENDING` report.",
    steps: [
      {
        action: "Call `reportPayment` again as the owning customer.",
        expected: "The call rejects with `ConflictException`.",
      },
      {
        action: "Inspect the stored reports and the object storage.",
        expected: "Exactly one report row remains, and the newly uploaded object is deleted again.",
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
  {
    key: "invoices.payment-reports.rejects-unsupported-type",
    suite: paymentSuite,
    title: "refuses a receipt whose bytes are not an image or a PDF",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "A receipt lands in the same bucket as an order attachment and used to keep whatever type the upload " +
      "declared, so the same client-chosen header decided what the API later serves. The receipt is a photo " +
      "or a scanned PDF, and anything else is refused with `415` before an object key exists - otherwise a " +
      "customer could park a page or a script in the bucket under the name of a bank receipt.",
    preconditions: "An order waiting for payment and its issued invoice.",
    steps: [
      {
        action: "Report payment with an HTML document named `receipt.pdf` and the declared type `application/pdf`.",
        expected:
          "The call answers `UnsupportedMediaTypeException`, the storage receives neither an object key nor a " +
          "`put`, and no payment report row appears.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.receipt-download-neutral-type",
    suite: paymentSuite,
    title: "serves a receipt download as a neutral binary stream",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "A receipt is downloaded, never rendered: answering with `application/octet-stream` means the browser " +
      "saves the file whatever the stored row or the bucket says about its type, even if an inline preview " +
      "for receipts is added later. The stored type stays in the database for the product and the audit.",
    preconditions: "A pending receipt whose row and object both report `application/pdf`.",
    steps: [
      {
        action: "Download the receipt as the owning customer.",
        expected:
          "The result carries `contentType: \"application/octet-stream\"`, the stored file name and the bytes.",
      },
    ],
  },
  {
    key: "invoices.validation.void-reason",
    suite: validationSuite,
    title: "requires a non-blank reason to void an invoice",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Voiding is irreversible from the customer's point of view, and the reason is the only explanation " +
      "left in the invoice history, so an empty one defeats the audit trail. The 2000-character limit " +
      "keeps a single reason from filling the column, and the whitespace check stops a reason that renders " +
      "as an empty line.",
    preconditions: "An issued invoice that the administrator wants to void.",
    steps: [
      {
        action: "Validate a 2000-character reason, a 2001-character reason and `\"  \\n \"`.",
        expected:
          "The 2000-character reason passes; the longer one and the whitespace-only one report an error " +
          "for `reason`.",
      },
    ],
  },
  {
    key: "invoices.validation.reject-reason",
    suite: validationSuite,
    title: "requires a non-blank reason to reject a payment report",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "The rejection reason is shown to the customer so the receipt can be uploaded again; an empty one " +
      "leaves the customer with a refused payment and no instruction. Rejection lives in its own DTO, so " +
      "the same rule is asserted separately from voiding.",
    steps: [
      {
        action: "Validate a readable reason and `\"\"` against `RejectPaymentReportDto`.",
        expected: "The readable reason passes; the empty one reports an error for `reason`.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
