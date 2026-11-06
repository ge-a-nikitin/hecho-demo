import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  InvoiceStatus,
  OrderStatus,
  PaymentReportStatus,
  UserRole,
} from "../generated/prisma/enums.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ObjectStorageService } from "../storage/object-storage.service.js";
import type { OrdersService } from "../orders/orders.service.js";
import { InvoicesService } from "./invoices.service.js";

describe("InvoicesService payment reports", () => {
  it("stores a customer receipt without marking the invoice paid or completing the order", async () => {
    let reportData: Record<string, unknown> | undefined;
    let invoiceUpdateCount = 0;
    let orderStatusUpdateCount = 0;
    let uploadedObjectKey = "";
    const service = createService(
      {
        invoice: {
          findFirst: async () => ({
            id: "invoice-1",
            status: InvoiceStatus.ISSUED,
            order: { customerId: "customer-1", status: OrderStatus.INVOICE_ISSUED },
          }),
        },
        $transaction: async (run: (tx: object) => Promise<unknown>) =>
          run({
            workOrder: {
              updateMany: async ({ data }: { data: Record<string, unknown> }) => {
                if (data.status) orderStatusUpdateCount += 1;
                return { count: 1 };
              },
            },
            invoice: {
              findFirst: async () => ({ id: "invoice-1" }),
              updateMany: async () => {
                invoiceUpdateCount += 1;
                return { count: 1 };
              },
            },
            invoicePaymentReport: {
              findFirst: async () => null,
              create: async ({ data }: { data: Record<string, unknown> }) => {
                reportData = data;
                return { id: "report-1", status: PaymentReportStatus.PENDING };
              },
            },
          }),
      },
      {
        createObjectKey: () => "orders/order-1/receipt",
        put: async (key: string) => {
          uploadedObjectKey = key;
        },
        delete: async () => undefined,
      },
    );

    const report = await service.reportPayment(
      "order-1",
      "invoice-1",
      {
        buffer: Buffer.from("receipt"),
        originalname: "receipt.txt",
        mimetype: "text/plain",
        size: 7,
      },
      { id: "customer-1", role: UserRole.CUSTOMER },
    );

    assert.deepEqual(report, { id: "report-1", status: PaymentReportStatus.PENDING });
    assert.equal(reportData?.submittedById, "customer-1");
    assert.equal(reportData?.objectKey, "orders/order-1/receipt");
    assert.equal(uploadedObjectKey, "orders/order-1/receipt");
    assert.equal(invoiceUpdateCount, 0);
    assert.equal(orderStatusUpdateCount, 0);
  });

  it("confirms payment and moves the order to INVOICE_PAID without completing it", async () => {
    let invoiceUpdate: Record<string, unknown> | undefined;
    let orderUpdate: Record<string, unknown> | undefined;
    let reportUpdate: Record<string, unknown> | undefined;
    let historyData: Record<string, unknown> | undefined;
    const service = createService({
      $transaction: async (run: (tx: object) => Promise<unknown>) =>
        run({
          invoicePaymentReport: {
            findFirst: async () => ({
              id: "report-1",
              status: PaymentReportStatus.PENDING,
              invoice: { id: "invoice-1", number: "INV-2026-000001", status: InvoiceStatus.ISSUED },
            }),
            updateMany: async (args: { data: Record<string, unknown> }) => {
              reportUpdate = args.data;
              return { count: 1 };
            },
          },
          workOrder: {
            updateMany: async (args: { data: Record<string, unknown> }) => {
              if (args.data.status) orderUpdate = args.data;
              return { count: 1 };
            },
          },
          invoice: {
            updateMany: async (args: { data: Record<string, unknown> }) => {
              invoiceUpdate = args.data;
              return { count: 1 };
            },
            findUniqueOrThrow: async () => ({ id: "invoice-1", status: InvoiceStatus.PAID }),
          },
          orderStatusHistory: {
            create: async (args: { data: Record<string, unknown> }) => {
              historyData = args.data;
            },
          },
        }),
    });

    const invoice = await service.confirmPaymentReport(
      "order-1",
      "invoice-1",
      "report-1",
      { id: "admin-1", role: UserRole.ADMIN },
    );

    assert.deepEqual(invoice, { id: "invoice-1", status: InvoiceStatus.PAID });
    assert.equal(reportUpdate?.status, PaymentReportStatus.CONFIRMED);
    assert.equal(reportUpdate?.reviewedById, "admin-1");
    assert.equal(invoiceUpdate?.status, InvoiceStatus.PAID);
    assert.equal(orderUpdate?.status, OrderStatus.INVOICE_PAID);
    assert.equal(orderUpdate?.completedAt, undefined);
    assert.equal(historyData?.toStatus, OrderStatus.INVOICE_PAID);
  });

  it("does not allow executors to read customer payment receipts", async () => {
    let storageRead = false;
    const service = createService(
      {
        invoicePaymentReport: {
          findFirst: async () => ({
            objectKey: "orders/order-1/receipt",
            filename: "receipt.txt",
            invoice: { order: { customerId: "customer-1" } },
          }),
        },
      },
      {
        get: async () => {
          storageRead = true;
          return { bytes: Buffer.from("receipt") };
        },
      },
    );

    await assert.rejects(
      service.paymentReportFile("order-1", "invoice-1", "report-1", {
        id: "executor-1",
        role: UserRole.EXECUTOR,
      }),
      ForbiddenException,
    );
    assert.equal(storageRead, false);
  });

  function createService(
    prisma: Record<string, unknown>,
    storage: Record<string, unknown> = {},
  ) {
    return new InvoicesService(
      prisma as unknown as PrismaService,
      {} as OrdersService,
      storage as unknown as ObjectStorageService,
    );
  }
});
