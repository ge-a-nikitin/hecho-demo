import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import {
  InvoiceStatus,
  OrderStatus,
  PaymentReportStatus,
  UserRole,
} from "../generated/prisma/enums.js";
import type { UploadedOrderFile } from "../orders/order-files.service.js";
import type { OrdersService } from "../orders/orders.service.js";
import type { ObjectStorageService } from "../storage/object-storage.service.js";
import { createFakeDatabase } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
import { InvoicesService } from "./invoices.service.js";

const objectKey = "orders/order-1/receipt";
const customer = { id: "customer-1", role: UserRole.CUSTOMER };
const administrator = { id: "admin-1", role: UserRole.ADMIN };

describe("Invoices", () => {
  describe("Payment reports", () => {
    beforeEach(() => {
      for (const mock of [createObjectKey, put, remove, getObject]) mock.mockClear();
    });

    it(
      qc(
        "invoices.payment-reports.receipt-stored",
        "stores a customer receipt without marking the invoice paid or completing the order",
      ),
      async () => {
        const { db, service } = serviceWith(awaitingPayment());

        const report = await service.reportPayment("order-1", "invoice-1", receipt(), customer);

        expect(report).toMatchObject({
          status: PaymentReportStatus.PENDING,
          filename: "receipt.pdf",
        });
        expect(db.rows("invoicePaymentReport")).toHaveLength(1);
        expect(db.rows("invoicePaymentReport")[0]).toMatchObject({
          invoiceId: "invoice-1",
          submittedById: customer.id,
          objectKey,
          filename: "receipt.pdf",
          contentType: "application/pdf",
          sizeBytes: 8,
          status: PaymentReportStatus.PENDING,
          submittedAt: expect.any(Date),
        });
        expect(db.rows("invoice")[0]).toMatchObject({ status: InvoiceStatus.ISSUED });
        expect(db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.INVOICE_ISSUED });
        expect(db.rows("workOrder")[0]?.completedAt).toBeUndefined();
        expect(put).toHaveBeenCalledWith(
          objectKey,
          expect.objectContaining({ size: 8, mimetype: "application/pdf" }),
        );
      },
    );

    it(
      qc(
        "invoices.payment-reports.confirm-payment",
        "confirms payment and moves the order to INVOICE_PAID without completing it",
      ),
      async () => {
        const { db, service } = serviceWith(pendingReport());

        const invoice = await service.confirmPaymentReport(
          "order-1",
          "invoice-1",
          "report-1",
          administrator,
        );

        expect(invoice).toMatchObject({ id: "invoice-1", status: InvoiceStatus.PAID });
        expect(db.rows("invoice")[0]).toMatchObject({
          status: InvoiceStatus.PAID,
          paidAt: expect.any(Date),
        });
        expect(db.rows("invoicePaymentReport")[0]).toMatchObject({
          status: PaymentReportStatus.CONFIRMED,
          reviewedById: administrator.id,
          reviewedAt: expect.any(Date),
        });
        expect(db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.INVOICE_PAID });
        expect(db.rows("workOrder")[0]?.completedAt).toBeUndefined();
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            orderId: "order-1",
            changedById: administrator.id,
            fromStatus: OrderStatus.INVOICE_ISSUED,
            toStatus: OrderStatus.INVOICE_PAID,
            note: expect.stringContaining("INV-2026-000001"),
          }),
        ]);
      },
    );

    it(
      qc(
        "invoices.payment-reports.duplicate-guard",
        "refuses a second receipt while one is awaiting review",
      ),
      async () => {
        const { db, service } = serviceWith(pendingReport());

        await expect(
          service.reportPayment("order-1", "invoice-1", receipt(), customer),
        ).rejects.toThrow(ConflictException);

        expect(db.rows("invoicePaymentReport")).toHaveLength(1);
        expect(remove).toHaveBeenCalledWith(objectKey);
      },
    );

    it(
      qc(
        "invoices.payment-reports.executor-denied",
        "does not allow executors to read customer payment receipts",
      ),
      async () => {
        const { service } = serviceWith(pendingReport());

        await expect(
          service.paymentReportFile("order-1", "invoice-1", "report-1", {
            id: "executor-1",
            role: UserRole.EXECUTOR,
          }),
        ).rejects.toThrow(ForbiddenException);

        expect(getObject).not.toHaveBeenCalled();
      },
    );
    it(
      qc(
        "invoices.payment-reports.rejects-unsupported-type",
        "refuses a receipt whose bytes are not an image or a PDF",
      ),
      async () => {
        const { db, service } = serviceWith(awaitingPayment());

        await expect(
          service.reportPayment(
            "order-1",
            "invoice-1",
            receipt({
              buffer: Buffer.from("<html><script>alert(1)</script></html>"),
              originalname: "receipt.pdf",
              mimetype: "application/pdf",
              size: 38,
            }),
            customer,
          ),
        ).rejects.toThrow(UnsupportedMediaTypeException);

        expect(createObjectKey).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(db.rows("invoicePaymentReport")).toEqual([]);
      },
    );

    it(
      qc(
        "invoices.payment-reports.receipt-download-neutral-type",
        "serves a receipt download as a neutral binary stream",
      ),
      async () => {
        const { service } = serviceWith(pendingReport());
        getObject.mockResolvedValue({ bytes: Buffer.from("%PDF-1.7"), contentType: "application/pdf" });

        await expect(
          service.paymentReportFile("order-1", "invoice-1", "report-1", customer),
        ).resolves.toEqual({
          bytes: Buffer.from("%PDF-1.7"),
          filename: "receipt.pdf",
          contentType: "application/octet-stream",
        });
      },
    );

    it(
      qc(
        "invoices.payment-reports.reject-records-reason",
        "rejects a receipt with the administrator's reason and leaves the invoice unpaid",
      ),
      async () => {
        const { db, service } = serviceWith(pendingReport());
        const reason = "The receipt does not show the transfer date";

        const report = await service.rejectPaymentReport(
          "order-1",
          "invoice-1",
          "report-1",
          `  ${reason}  `,
          administrator,
        );

        expect(report).toMatchObject({
          id: "report-1",
          status: PaymentReportStatus.REJECTED,
          reviewComment: reason,
          reviewedAt: expect.any(Date),
        });
        // The reviewer stays in the row for the audit even though the response
        // that the customer sees does not need to name the administrator.
        expect(db.rows("invoicePaymentReport")[0]).toMatchObject({
          reviewedById: administrator.id,
        });
        expect(db.rows("invoice")[0]).toMatchObject({ status: InvoiceStatus.ISSUED });
        expect(db.rows("invoice")[0]?.paidAt).toBeUndefined();
        expect(db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.INVOICE_ISSUED });
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            orderId: "order-1",
            changedById: administrator.id,
            fromStatus: OrderStatus.INVOICE_ISSUED,
            toStatus: OrderStatus.INVOICE_ISSUED,
            note: `Payment report rejected: ${reason}`,
          }),
        ]);
      },
    );

    it(
      qc(
        "invoices.payment-reports.rejects-reviewed-report",
        "refuses a second decision on a receipt that was already reviewed",
      ),
      async () => {
        const reviewedAt = new Date("2026-02-03T10:00:00Z");
        const { db, service } = serviceWith({
          ...awaitingPayment(),
          invoicePaymentReport: [
            {
              id: "report-1",
              invoiceId: "invoice-1",
              status: PaymentReportStatus.CONFIRMED,
              objectKey,
              filename: "receipt.pdf",
              reviewedAt,
            },
          ],
        });

        await expect(
          service.rejectPaymentReport("order-1", "invoice-1", "report-1", "Too late", administrator),
        ).rejects.toThrow(ConflictException);
        await expect(
          service.confirmPaymentReport("order-1", "invoice-1", "report-1", administrator),
        ).rejects.toThrow(ConflictException);

        expect(db.rows("invoicePaymentReport")[0]).toMatchObject({
          status: PaymentReportStatus.CONFIRMED,
          reviewedAt,
        });
        expect(db.rows("invoice")[0]).toMatchObject({ status: InvoiceStatus.ISSUED });
        expect(db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.INVOICE_ISSUED });
        expect(db.rows("orderStatusHistory")).toEqual([]);
      },
    );

    it(
      qc(
        "invoices.payment-reports.requires-receipt-file",
        "refuses a payment report without a receipt or with a file above 1 MB",
      ),
      async () => {
        const { db, service } = serviceWith(awaitingPayment());

        await expect(
          service.reportPayment("order-1", "invoice-1", undefined, customer),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.reportPayment(
            "order-1",
            "invoice-1",
            receipt({ size: 1_048_577, buffer: Buffer.concat([receipt().buffer, Buffer.alloc(2)]) }),
            customer,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(createObjectKey).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(db.rows("invoicePaymentReport")).toEqual([]);
      },
    );

    it(
      qc(
        "invoices.payment-reports.invoice-must-be-active",
        "accepts a receipt only while the invoice and its order still await payment",
      ),
      async () => {
        const voidedInvoice = serviceWith({
          ...awaitingPayment(),
          invoice: [
            {
              id: "invoice-1",
              orderId: "order-1",
              number: "INV-2026-000001",
              status: InvoiceStatus.VOID,
            },
          ],
        });
        const paidOrder = serviceWith({
          ...awaitingPayment(),
          workOrder: [
            {
              id: "order-1",
              customerId: customer.id,
              executorId: "executor-1",
              status: OrderStatus.INVOICE_PAID,
            },
          ],
        });

        await expect(
          voidedInvoice.service.reportPayment("order-1", "invoice-1", receipt(), customer),
        ).rejects.toThrow(ConflictException);
        await expect(
          paidOrder.service.reportPayment("order-1", "invoice-1", receipt(), customer),
        ).rejects.toThrow(ConflictException);

        expect(createObjectKey).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(voidedInvoice.db.rows("invoicePaymentReport")).toEqual([]);
        expect(paidOrder.db.rows("invoicePaymentReport")).toEqual([]);
      },
    );

    it(
      qc(
        "invoices.payment-reports.only-owner-customer",
        "lets only the customer who owns the order submit a receipt",
      ),
      async () => {
        const { db, service } = serviceWith(awaitingPayment());

        await expect(
          service.reportPayment("order-1", "invoice-1", receipt(), {
            id: "executor-1",
            role: UserRole.EXECUTOR,
          }),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.reportPayment("order-1", "invoice-1", receipt(), {
            id: "customer-2",
            role: UserRole.CUSTOMER,
          }),
        ).rejects.toThrow(ForbiddenException);

        expect(createObjectKey).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        expect(db.rows("invoicePaymentReport")).toEqual([]);
      },
    );

    it(
      qc(
        "invoices.payment-reports.scopes-to-order",
        "answers not found for an invoice that belongs to another order",
      ),
      async () => {
        const { db, service } = serviceWith(awaitingPayment());

        await expect(
          service.reportPayment("order-1", "invoice-of-another-order", receipt(), customer),
        ).rejects.toThrow(NotFoundException);

        expect(put).not.toHaveBeenCalled();
        expect(db.rows("invoicePaymentReport")).toEqual([]);
      },
    );
  });

  describe("Voiding", () => {
    beforeEach(() => {
      for (const mock of [createObjectKey, put, remove, getObject]) mock.mockClear();
    });

    it(
      qc(
        "invoices.void.records-reason",
        "voids an unpaid invoice with the administrator's reason and keeps the order open for a new one",
      ),
      async () => {
        const { db, service } = serviceWith(awaitingPayment());

        const invoice = await service.void(
          "order-1",
          "invoice-1",
          { reason: "  Amount was miscalculated  " },
          administrator,
        );

        expect(invoice).toMatchObject({
          id: "invoice-1",
          status: InvoiceStatus.VOID,
          voidReason: "Amount was miscalculated",
          voidedById: administrator.id,
          voidedAt: expect.any(Date),
        });
        expect(db.rows("invoice")[0]).toMatchObject({
          status: InvoiceStatus.VOID,
          voidedAt: expect.any(Date),
        });
        expect(db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.INVOICE_ISSUED });
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            orderId: "order-1",
            changedById: administrator.id,
            fromStatus: OrderStatus.INVOICE_ISSUED,
            toStatus: OrderStatus.INVOICE_ISSUED,
            note: "Invoice INV-2026-000001 voided: Amount was miscalculated",
          }),
        ]);
      },
    );

    it(
      qc(
        "invoices.void.blocked-by-pending-report",
        "refuses to void an invoice while its payment receipt awaits review",
      ),
      async () => {
        const { db, service } = serviceWith(pendingReport());

        await expect(
          service.void("order-1", "invoice-1", { reason: "Issued twice" }, administrator),
        ).rejects.toThrow(ConflictException);

        expect(db.rows("invoice")[0]).toMatchObject({ status: InvoiceStatus.ISSUED });
        expect(db.rows("invoice")[0]?.voidedAt).toBeUndefined();
        expect(db.rows("invoicePaymentReport")[0]).toMatchObject({
          status: PaymentReportStatus.PENDING,
        });
        expect(db.rows("orderStatusHistory")).toEqual([]);
      },
    );

    it(
      qc(
        "invoices.void.refuses-paid-invoice",
        "refuses to void a paid invoice and reports an unknown invoice as not found",
      ),
      async () => {
        const paidAt = new Date("2026-02-04T09:30:00Z");
        const { db, service } = serviceWith({
          workOrder: [
            {
              id: "order-1",
              customerId: customer.id,
              executorId: "executor-1",
              status: OrderStatus.INVOICE_PAID,
            },
          ],
          invoice: [
            {
              id: "invoice-1",
              orderId: "order-1",
              number: "INV-2026-000001",
              status: InvoiceStatus.PAID,
              paidAt,
            },
          ],
        });

        await expect(
          service.void(
            "order-1",
            "invoice-1",
            { reason: "Trying to undo a payment" },
            administrator,
          ),
        ).rejects.toThrow(ConflictException);

        const unpaid = serviceWith(awaitingPayment());

        await expect(
          unpaid.service.void(
            "order-1",
            "invoice-of-another-order",
            { reason: "Any reason" },
            administrator,
          ),
        ).rejects.toThrow(NotFoundException);

        expect(db.rows("invoice")).toEqual([
          expect.objectContaining({ id: "invoice-1", status: InvoiceStatus.PAID, paidAt }),
        ]);
        expect(db.rows("orderStatusHistory")).toEqual([]);
        expect(unpaid.db.rows("invoice")).toEqual([
          expect.objectContaining({ id: "invoice-1", status: InvoiceStatus.ISSUED }),
        ]);
      },
    );
  });
});

const createObjectKey = vi.fn(() => objectKey);
const put = vi.fn();
const remove = vi.fn();
const getObject = vi.fn();

function serviceWith(seed: Parameters<typeof createFakeDatabase>[0]) {
  const db = createFakeDatabase(seed);

  return {
    db,
    service: new InvoicesService(
      db.prisma as unknown as PrismaService,
      {} as OrdersService,
      { createObjectKey, put, delete: remove, get: getObject } as unknown as ObjectStorageService,
    ),
  };
}

/** An order waiting for payment and the issued invoice that asks for it. */
function awaitingPayment() {
  return {
    workOrder: [
      {
        id: "order-1",
        customerId: customer.id,
        executorId: "executor-1",
        status: OrderStatus.INVOICE_ISSUED,
      },
    ],
    invoice: [
      {
        id: "invoice-1",
        orderId: "order-1",
        number: "INV-2026-000001",
        status: InvoiceStatus.ISSUED,
      },
    ],
  };
}

function pendingReport() {
  return {
    ...awaitingPayment(),
    invoicePaymentReport: [
      {
        id: "report-1",
        invoiceId: "invoice-1",
        status: PaymentReportStatus.PENDING,
        objectKey,
        filename: "receipt.pdf",
      },
    ],
  };
}

function receipt(overrides: Partial<UploadedOrderFile> = {}): UploadedOrderFile {
  return {
    buffer: Buffer.from("%PDF-1.7"),
    originalname: "receipt.pdf",
    mimetype: "application/pdf",
    size: 8,
    ...overrides,
  };
}
