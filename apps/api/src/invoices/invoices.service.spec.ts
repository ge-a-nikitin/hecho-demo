import {
  ConflictException,
  ForbiddenException,
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
