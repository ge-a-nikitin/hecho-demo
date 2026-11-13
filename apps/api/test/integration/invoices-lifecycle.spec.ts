import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { qc } from "../../src/test-support/qase-case.js";
import {
  createActor,
  resetWorld,
  signInAdmin,
  waitForApi,
  type Actor,
} from "./helpers/stack.js";

/**
 * Integration suite for invoices and payment reports against the real HTTP API,
 * PostgreSQL and SeaweedFS. It covers what the unit suite cannot reach: the
 * yearly numbering sequence, the one-active-invoice rule in the database, the
 * receipt lifecycle across a real bucket, and the invoice PDF that is generated
 * from the stored snapshot.
 */

const HOURLY_RATE = 60;
const HOURS = 2.5;
const RECEIPT_BYTES = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

type StatusEntry = { fromStatus: string | null; toStatus: string; note: string | null };

type PaymentReport = {
  id: string;
  status: string;
  filename: string;
  reviewComment: string | null;
  reviewedAt: string | null;
};

type Invoice = {
  id: string;
  number: string;
  status: string;
  hours: string;
  hourlyRate: string;
  amount: string;
  customerName: string;
  executorName: string;
  issuedAt: string;
  paidAt: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
  paymentReports: PaymentReport[];
};

type Order = {
  id: string;
  status: string;
  acceptedAt: string | null;
  completedAt: string | null;
  invoices: Invoice[];
  statusHistory: StatusEntry[];
};

type ApiError = { statusCode: number; code: string; message: string | string[] };

let admin: Actor;
let customer: Actor;
let outsider: Actor;
let executor: Actor;
let categoryId: string;
let customerName: string;
let executorName: string;
let titleCounter = 0;

beforeAll(async () => {
  await waitForApi();
  await resetWorld();

  admin = await signInAdmin();
  const category = await admin.post<{ id: string }>("/categories", {
    name: `Billing ${randomUUID()}`,
  });
  expect(category.status).toBe(201);
  categoryId = category.body.id;

  customer = await createActor("CUSTOMER");
  outsider = await createActor("CUSTOMER");
  executor = await createActor("EXECUTOR");

  const rate = await executor.patch("/users/me/hourly-rate", { hourlyRate: HOURLY_RATE });
  expect(rate.status).toBe(200);

  customerName = (await customer.get<{ name: string }>("/users/me")).body.name;
  executorName = (await executor.get<{ name: string }>("/users/me")).body.name;
});

function nextTitle(): string {
  titleCounter += 1;
  return `Billing order ${titleCounter}`;
}

/** The invoice number counts sequentially per year, so the last segment is the sequence. */
function sequenceOf(number: string): number {
  return Number(number.split("-").at(-1));
}

/** Drives a fresh order to the state the administrator invoices: accepted work. */
async function acceptedWork(): Promise<Order> {
  const draft = await customer.post<Order>("/orders", {
    title: nextTitle(),
    description: "Work that the administrator will invoice",
    categoryId,
    executorId: executor.id,
  });
  expect(draft.status).toBe(201);

  const submitted = await customer.post<Order>(`/orders/${draft.body.id}/submit`);
  expect(submitted.body.status).toBe("ASSIGNED");

  const estimate = await executor.post<{ id: string }>(`/orders/${draft.body.id}/estimate`, {
    hours: HOURS,
  });
  expect(estimate.status).toBe(201);

  const accepted = await customer.post<{ order: Order }>(
    `/orders/${draft.body.id}/estimates/${estimate.body.id}/respond`,
    { accepted: true, comment: "Agreed, please start on Monday" },
  );
  expect(accepted.body.order.status).toBe("IN_PROGRESS");

  const time = await executor.post(`/orders/${draft.body.id}/time`, { minutes: 150 });
  expect(time.status).toBe(201);

  const review = await executor.post<Order>(`/orders/${draft.body.id}/submit-review`);
  expect(review.body.status).toBe("ON_REVIEW");

  const acceptedWork = await customer.post<Order>(`/orders/${draft.body.id}/accept`);
  expect(acceptedWork.status).toBe(201);
  expect(acceptedWork.body.acceptedAt).not.toBeNull();

  return acceptedWork.body;
}

async function issueInvoice(order: Order): Promise<Invoice> {
  const issued = await admin.post<Invoice>(`/orders/${order.id}/invoices`);
  expect(issued.status).toBe(201);

  return issued.body;
}

/** An order with an issued invoice that still waits for the customer's receipt. */
async function awaitingPayment(): Promise<{ order: Order; invoice: Invoice }> {
  const order = await acceptedWork();
  const invoice = await issueInvoice(order);
  const stored = await customer.get<Order>(`/orders/${order.id}`);

  return { order: stored.body, invoice };
}

/** An order whose invoice was paid through the receipt and confirmation flow. */
async function paidOrder(): Promise<Order> {
  const { order, invoice } = await awaitingPayment();
  const report = await customer.upload<PaymentReport>(
    `/orders/${order.id}/invoices/${invoice.id}/payment-reports`,
    "receipt.pdf",
    RECEIPT_BYTES,
  );
  expect(report.status).toBe(201);

  const confirmed = await admin.post(
    `/orders/${order.id}/invoices/${invoice.id}/payment-reports/${report.body.id}/confirm`,
  );
  expect(confirmed.status).toBe(201);

  const stored = await customer.get<Order>(`/orders/${order.id}`);
  expect(stored.body.status).toBe("INVOICE_PAID");

  return stored.body;
}

describe("Invoices (integration)", () => {
  describe("Issuing", () => {
    it(
      qc(
        "integration.invoices.numbering",
        "numbers issued invoices sequentially and snapshots the accepted work",
      ),
      async () => {
        const firstOrder = await acceptedWork();
        const first = await issueInvoice(firstOrder);
        const second = await issueInvoice(await acceptedWork());

        const year = new Date().getUTCFullYear();
        expect(first.number).toMatch(new RegExp(`^INV-${year}-\\d{6}$`, "u"));
        expect(sequenceOf(second.number)).toBe(sequenceOf(first.number) + 1);
        expect(first).toMatchObject({
          status: "ISSUED",
          customerName,
          executorName,
        });
        expect(Number(first.hours)).toBe(HOURS);
        expect(Number(first.hourlyRate)).toBe(HOURLY_RATE);
        expect(Number(first.amount)).toBe(HOURS * HOURLY_RATE);

        const stored = await customer.get<Order>(`/orders/${firstOrder.id}`);
        expect(stored.body.status).toBe("INVOICE_ISSUED");
        expect(stored.body.invoices).toHaveLength(1);
        expect(stored.body.statusHistory.at(-1)?.note).toContain(first.number);
      },
    );

    it(
      qc("integration.invoices.one-active", "refuses a second active invoice for the same order"),
      async () => {
        const order = await acceptedWork();
        const invoice = await issueInvoice(order);

        const again = await admin.post<ApiError>(`/orders/${order.id}/invoices`);

        expect(again.status).toBe(409);
        expect(again.body).toMatchObject({
          code: "CONFLICT",
          message: "This order already has an active invoice",
        });

        const stored = await customer.get<Order>(`/orders/${order.id}`);
        expect(stored.body.invoices).toEqual([
          expect.objectContaining({ id: invoice.id, status: "ISSUED" }),
        ]);
      },
    );
  });

  describe("Voiding", () => {
    it(
      qc(
        "integration.invoices.void-and-reissue",
        "voids an unpaid invoice with a reason and reissues it under a new number",
      ),
      async () => {
        const order = await acceptedWork();
        const invoice = await issueInvoice(order);

        const voided = await admin.post<Invoice>(
          `/orders/${order.id}/invoices/${invoice.id}/void`,
          { reason: "Amount was miscalculated" },
        );

        expect(voided.status).toBe(201);
        expect(voided.body).toMatchObject({
          status: "VOID",
          voidReason: "Amount was miscalculated",
          voidedById: admin.id,
        });
        expect(voided.body.voidedAt).not.toBeNull();

        const reissued = await issueInvoice(order);

        expect(reissued.id).not.toBe(invoice.id);
        expect(reissued.number).not.toBe(invoice.number);
        expect(sequenceOf(reissued.number)).toBeGreaterThan(sequenceOf(invoice.number));

        const stored = await customer.get<Order>(`/orders/${order.id}`);
        expect(stored.body.status).toBe("INVOICE_ISSUED");
        expect(stored.body.invoices.map((entry) => entry.status)).toEqual(["VOID", "ISSUED"]);
        expect(stored.body.invoices[0]?.number).toBe(invoice.number);
        expect(stored.body.invoices[1]?.number).toBe(reissued.number);
      },
    );

    it(
      qc(
        "integration.invoices.void-after-payment",
        "refuses to void an invoice after the customer has paid it",
      ),
      async () => {
        const order = await paidOrder();
        const invoice = order.invoices[0];
        expect(invoice).toBeDefined();

        const response = await admin.post<ApiError>(
          `/orders/${order.id}/invoices/${invoice!.id}/void`,
          { reason: "Trying to undo a payment" },
        );

        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: "CONFLICT" });

        const stored = await customer.get<Order>(`/orders/${order.id}`);
        expect(stored.body.invoices[0]).toMatchObject({ status: "PAID", voidedAt: null });
        expect(stored.body.invoices[0]?.paidAt).not.toBeNull();
      },
    );
  });

  describe("Payment review", () => {
    it(
      qc(
        "integration.invoices.receipt-cycle",
        "reviews a receipt, accepts a new upload after a rejection and marks the invoice paid",
      ),
      async () => {
        const { order, invoice } = await awaitingPayment();
        const reason = "The receipt does not show the transfer date";
        const reportsPath = `/orders/${order.id}/invoices/${invoice.id}/payment-reports`;

        const first = await customer.upload<PaymentReport>(reportsPath, "first-receipt.pdf", RECEIPT_BYTES);
        expect(first.status).toBe(201);
        expect(first.body).toMatchObject({ status: "PENDING" });

        const afterUpload = await customer.get<Order>(`/orders/${order.id}`);
        expect(afterUpload.body.status).toBe("INVOICE_ISSUED");
        expect(afterUpload.body.invoices[0]).toMatchObject({ status: "ISSUED" });

        const rejected = await admin.post<PaymentReport>(`${reportsPath}/${first.body.id}/reject`, {
          reason,
        });
        expect(rejected.status).toBe(201);
        expect(rejected.body).toMatchObject({ status: "REJECTED", reviewComment: reason });

        const second = await customer.upload<PaymentReport>(
          reportsPath,
          "second-receipt.pdf",
          RECEIPT_BYTES,
        );
        expect(second.status).toBe(201);

        const confirmed = await admin.post<Invoice>(
          `${reportsPath}/${second.body.id}/confirm`,
        );
        expect(confirmed.status).toBe(201);
        expect(confirmed.body).toMatchObject({ status: "PAID" });
        expect(confirmed.body.paidAt).not.toBeNull();

        const stored = await customer.get<Order>(`/orders/${order.id}`);
        expect(stored.body.status).toBe("INVOICE_PAID");
        expect(stored.body.completedAt).toBeNull();
        expect(stored.body.invoices[0]?.paymentReports.map((report) => report.status)).toEqual([
          "CONFIRMED",
          "REJECTED",
        ]);
      },
    );

    it(
      qc(
        "integration.invoices.receipt-access",
        "keeps the receipt away from the executor and serves it to the administrator as a download",
      ),
      async () => {
        const { order, invoice } = await awaitingPayment();
        const report = await customer.upload<PaymentReport>(
          `/orders/${order.id}/invoices/${invoice.id}/payment-reports`,
          "receipt.pdf",
          RECEIPT_BYTES,
        );
        expect(report.status).toBe(201);
        const filePath = `/orders/${order.id}/invoices/${invoice.id}/payment-reports/${report.body.id}/file`;

        const byExecutor = await executor.get<ApiError>(filePath);
        expect(byExecutor.status).toBe(403);
        expect(byExecutor.body).toMatchObject({ code: "FORBIDDEN" });

        const byOutsider = await outsider.get<ApiError>(filePath);
        expect(byOutsider.status).toBe(403);
        expect(byOutsider.body).toMatchObject({ code: "FORBIDDEN" });

        const byAdmin = await admin.download(filePath);
        expect(byAdmin.status).toBe(200);
        expect(byAdmin.headers.get("content-type")).toBe("application/octet-stream");
        expect(byAdmin.headers.get("content-disposition")).toContain("attachment");
        expect(byAdmin.bytes.equals(RECEIPT_BYTES)).toBe(true);

        const byOwner = await customer.download(filePath);
        expect(byOwner.status).toBe(200);
        expect(byOwner.bytes.equals(RECEIPT_BYTES)).toBe(true);
      },
    );
  });

  describe("Completion", () => {
    it(
      qc(
        "integration.invoices.complete-after-payment",
        "completes a paid order once and refuses the second completion",
      ),
      async () => {
        const order = await paidOrder();

        const completed = await admin.post<Order>(`/orders/${order.id}/complete`);
        expect(completed.status).toBe(201);
        expect(completed.body.status).toBe("COMPLETED");
        expect(completed.body.completedAt).not.toBeNull();

        const second = await admin.post<ApiError>(`/orders/${order.id}/complete`);
        expect(second.status).toBe(409);
        expect(second.body).toMatchObject({ code: "CONFLICT" });

        const stored = await customer.get<Order>(`/orders/${order.id}`);
        expect(stored.body).toMatchObject({ status: "COMPLETED" });
        expect(stored.body.statusHistory.at(-1)).toMatchObject({
          fromStatus: "INVOICE_PAID",
          toStatus: "COMPLETED",
        });
      },
    );
  });

  describe("Documents", () => {
    it(
      qc(
        "integration.invoices.pdf-stream",
        "serves the invoice PDF to the participants and hides it from another customer",
      ),
      async () => {
        const { order, invoice } = await awaitingPayment();
        const pdfPath = `/orders/${order.id}/invoices/${invoice.id}/pdf`;

        const pdf = await customer.download(pdfPath);
        expect(pdf.status).toBe(200);
        expect(pdf.headers.get("content-type")).toBe("application/pdf");
        expect(pdf.headers.get("content-disposition")).toContain("attachment");
        expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
        expect(pdf.bytes.length).toBeGreaterThan(1_000);

        const byExecutor = await executor.download(pdfPath);
        expect(byExecutor.status).toBe(200);

        const byOutsider = await outsider.download(pdfPath);
        expect(byOutsider.status).toBe(403);
      },
    );
  });
});

