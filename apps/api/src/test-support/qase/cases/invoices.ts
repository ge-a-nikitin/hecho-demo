import type { QaseCase } from "../types.js";

const paymentSuite = ["Invoices", "Payment reports"] as const;
const voidSuite = ["Invoices", "Voiding"] as const;
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
        action: "Call `reportPayment` with an 8-byte `receipt.pdf` upload as the owning customer.",
        expected:
          "The file is written to the generated object key, and the stored `InvoicePaymentReport` is " +
          "`PENDING` with `submittedById: customer-1`, that object key, `contentType: application/pdf` and " +
          "`sizeBytes: 8`.",
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
    key: "invoices.payment-reports.reject-records-reason",
    suite: paymentSuite,
    title: "rejects a receipt with the administrator's reason and leaves the invoice unpaid",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Rejection is the only way to send a payment back: the customer must see why the proof was refused and " +
      "upload another one, while the invoice stays payable. Clearing the pending report and recording the " +
      "trimmed reason in the same transaction is what keeps the history readable and the invoice open.",
    preconditions:
      "An invoice in `ISSUED` for an order in `INVOICE_ISSUED` with one `PENDING` payment report, and an " +
      "acting administrator.",
    steps: [
      {
        action: "Call `rejectPaymentReport` with the reason `\"The receipt does not show the transfer date\"` padded with spaces.",
        expected:
          "The stored report is `REJECTED` with that reason trimmed, `reviewedById: admin-1` and a review date.",
      },
      {
        action: "Inspect the invoice and the order after the same call.",
        expected: "The invoice is still `ISSUED` without `paidAt`, and the order is still `INVOICE_ISSUED`.",
      },
      {
        action: "Read the status history.",
        expected: "One entry records `INVOICE_ISSUED` to `INVOICE_ISSUED` with the rejection reason in its note.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.rejects-reviewed-report",
    suite: paymentSuite,
    title: "refuses a second decision on a receipt that was already reviewed",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A reviewed report is a closed decision: confirming it after a rejection, or rejecting it after a " +
      "confirmation, would rewrite what the customer was told and could pay an invoice twice. Both decisions " +
      "therefore refuse the report and leave the stored review untouched.",
    preconditions: "A `CONFIRMED` payment report on an `ISSUED` invoice, and an acting administrator.",
    steps: [
      {
        action: "Reject the already confirmed report.",
        expected: "The call answers `ConflictException`.",
      },
      {
        action: "Confirm the same report.",
        expected: "The call answers `ConflictException` as well.",
      },
      {
        action: "Inspect the report, the invoice, the order and the history.",
        expected:
          "The report keeps `CONFIRMED` and its original review date, the invoice is still `ISSUED`, and no " +
          "history row was written.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.requires-receipt-file",
    suite: paymentSuite,
    title: "refuses a payment report without a receipt or with a file above 1 MB",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A payment notification without proof cannot be verified, and the same 1 MB ceiling protects the volume " +
      "that the bucket shares with the database. Both refusals happen before an object key is generated, so a " +
      "refused upload costs neither storage nor a row that an administrator would have to review.",
    preconditions: "An issued invoice waiting for payment and a counting object storage stub.",
    steps: [
      {
        action: "Report payment without a file.",
        expected: "The call answers `BadRequestException`.",
      },
      {
        action: "Report payment with a file that reports 1 048 577 bytes.",
        expected: "The call answers `BadRequestException`.",
      },
      {
        action: "Inspect the storage stub and the payment report table.",
        expected: "No object key was requested, nothing was stored and no report row exists.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.invoice-must-be-active",
    suite: paymentSuite,
    title: "accepts a receipt only while the invoice and its order still await payment",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A voided invoice no longer asks for money and a paid order has already received it, so a receipt sent " +
      "against either of them would create a report nobody should review. The guard reads both the invoice and " +
      "its order, because the two can drift apart through a void or a confirmation.",
    preconditions: "A `VOID` invoice, and separately an `ISSUED` invoice on an order already `INVOICE_PAID`.",
    steps: [
      {
        action: "Report payment against the voided invoice as its owning customer.",
        expected: "The call answers `ConflictException`.",
      },
      {
        action: "Report payment against the invoice of the paid order.",
        expected: "The call answers `ConflictException`.",
      },
      {
        action: "Inspect the storage stub and the report table.",
        expected: "No object was stored and neither attempt left a report row.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.only-owner-customer",
    suite: paymentSuite,
    title: "lets only the customer who owns the order submit a receipt",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "A receipt proves that this customer paid this invoice. An executor has no business uploading one in the " +
      "customer's name, and another customer could otherwise attach a document to an order they cannot even " +
      "read. Both callers are refused before an object key exists.",
    preconditions: "An issued invoice owned by `customer-1`, and actors for an executor and for `customer-2`.",
    steps: [
      {
        action: "Report payment as an executor.",
        expected: "The call answers `ForbiddenException`.",
      },
      {
        action: "Report payment as a different customer.",
        expected: "The call answers `ForbiddenException` as well.",
      },
      {
        action: "Inspect the storage stub and the report table.",
        expected: "No object key was requested and no report row was stored.",
      },
    ],
  },
  {
    key: "invoices.payment-reports.scopes-to-order",
    suite: paymentSuite,
    title: "answers not found for an invoice that belongs to another order",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "The invoice id arrives from the client, so it is looked up together with the order it is supposed to " +
      "belong to. Without that pairing a customer could point a receipt at an invoice of someone else's order " +
      "and learn from the answer whether the id exists.",
    preconditions: "One order waiting for payment with its issued invoice.",
    steps: [
      {
        action: "Report payment for an invoice id that exists on another order.",
        expected: "The call answers `NotFoundException` rather than `ForbiddenException`.",
      },
      {
        action: "Inspect the storage stub and the report table.",
        expected: "Nothing was stored and no report row exists.",
      },
    ],
  },
  {
    key: "invoices.void.records-reason",
    suite: voidSuite,
    title: "voids an unpaid invoice with the administrator's reason and keeps the order open for a new one",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A wrong invoice has to be replaceable without deleting evidence: voiding keeps the number and the " +
      "reason, leaves the order in `INVOICE_ISSUED` so a new invoice can be issued, and records who voided it. " +
      "The trimmed reason is the only explanation a reader of the invoice gets.",
    preconditions:
      "An `ISSUED` invoice numbered `INV-2026-000001` for an order in `INVOICE_ISSUED`, with no pending report.",
    steps: [
      {
        action: "Void the invoice as the administrator with the reason `\"  Amount was miscalculated  \"`.",
        expected:
          "The returned invoice is `VOID` with the reason trimmed, `voidedById: admin-1` and a void date.",
      },
      {
        action: "Inspect the order after the same call.",
        expected: "The order is still `INVOICE_ISSUED`, so a replacement invoice can be issued.",
      },
      {
        action: "Read the status history.",
        expected:
          "One entry records `INVOICE_ISSUED` to `INVOICE_ISSUED` with a note naming the invoice number and " +
          "the reason.",
      },
    ],
  },
  {
    key: "invoices.void.blocked-by-pending-report",
    suite: voidSuite,
    title: "refuses to void an invoice while its payment receipt awaits review",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Voiding an invoice that already carries a receipt would leave the administrator reviewing proof of a " +
      "payment against a document that no longer asks for money. The decision therefore waits until the report " +
      "is confirmed or rejected.",
    preconditions: "An `ISSUED` invoice for an order in `INVOICE_ISSUED` with one `PENDING` payment report.",
    steps: [
      {
        action: "Void the invoice as the administrator.",
        expected: "The call answers `ConflictException`.",
      },
      {
        action: "Inspect the invoice, the report and the history.",
        expected:
          "The invoice is still `ISSUED` without a void date or reason, the report is still `PENDING`, and no " +
          "history row was written.",
      },
    ],
  },
  {
    key: "invoices.void.refuses-paid-invoice",
    suite: voidSuite,
    title: "refuses to void a paid invoice and reports an unknown invoice as not found",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Money that has arrived cannot be un-asked for by voiding the document: the paid invoice is immutable " +
      "and post-payment adjustments are out of scope. An id that does not belong to the order is a missing " +
      "record rather than a conflict, so the two answers stay distinguishable.",
    preconditions:
      "A `PAID` invoice with `paidAt` for an order in `INVOICE_PAID`, and the same order without any other invoice.",
    steps: [
      {
        action: "Void the paid invoice with a reason.",
        expected: "The call answers `ConflictException`.",
      },
      {
        action: "Void an invoice id that the order does not have.",
        expected: "The call answers `NotFoundException`.",
      },
      {
        action: "Inspect the stored invoice and the history.",
        expected: "The invoice is still `PAID` with its original `paidAt`, and no history row was written.",
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
