import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import { DevToolsService } from "./devtools.service.js";

describe("DevToolsService", () => {
  it("clears payment reports and invoices before deleting seed orders and users", async () => {
    const calls: string[] = [];
    let deletedInvoiceIds: string[] = [];
    let deletedReportInvoiceIds: string[] = [];
    let deletedOrderIds: string[] = [];
    const tx = {
      invoice: {
        findMany: async ({ where }: { where: { orderId: { in: string[] } } }) => {
          calls.push("invoice.findMany");
          assert.ok(where.orderId.in.includes("devtools-seed-v1-order-invoiced"));
          return [
            { id: "devtools-seed-v1-invoice-issued" },
            { id: "devtools-seed-v1-invoice-paid" },
            { id: "invoice-created-during-testing" },
          ];
        },
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          calls.push("invoice.deleteMany");
          deletedInvoiceIds = where.id.in;
          return { count: 0 };
        },
      },
      invoicePaymentReport: {
        deleteMany: async ({ where }: { where: { invoiceId: { in: string[] } } }) => {
          calls.push("invoicePaymentReport.deleteMany");
          deletedReportInvoiceIds = where.invoiceId.in;
          return { count: 0 };
        },
      },
      workOrder: {
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          calls.push("workOrder.deleteMany");
          deletedOrderIds = where.id.in;
          return { count: 0 };
        },
      },
      category: { deleteMany: async () => {
        calls.push("category.deleteMany");
        return { count: 0 };
      } },
      session: { deleteMany: async () => {
        calls.push("session.deleteMany");
        return { count: 0 };
      } },
      user: { deleteMany: async () => {
        calls.push("user.deleteMany");
        return { count: 0 };
      } },
    };
    const prisma = {
      $transaction: async (run: (transaction: object) => Promise<unknown>) => run(tx),
    };
    const service = new DevToolsService(prisma as unknown as PrismaService);

    await service.clearSeed();

    assert.deepEqual(calls, [
      "invoice.findMany",
      "invoicePaymentReport.deleteMany",
      "invoice.deleteMany",
      "workOrder.deleteMany",
      "category.deleteMany",
      "session.deleteMany",
      "user.deleteMany",
    ]);
    assert.ok(deletedReportInvoiceIds.includes("devtools-seed-v1-invoice-issued"));
    assert.ok(deletedReportInvoiceIds.includes("devtools-seed-v1-invoice-paid"));
    assert.ok(deletedReportInvoiceIds.includes("invoice-created-during-testing"));
    assert.ok(deletedInvoiceIds.includes("devtools-seed-v1-invoice-issued"));
    assert.ok(deletedInvoiceIds.includes("invoice-created-during-testing"));
    assert.ok(deletedOrderIds.includes("devtools-seed-v1-order-completed"));
  });

  it("reports a conflict when seed records are still referenced elsewhere", async () => {
    const prisma = {
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError("foreign key constraint failed", {
          code: "P2003",
          clientVersion: "test",
        });
      },
    };
    const service = new DevToolsService(prisma as unknown as PrismaService);

    await assert.rejects(service.clearSeed(), ConflictException);
  });
});
