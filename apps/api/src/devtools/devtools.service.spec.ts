import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import { DevToolsService } from "./devtools.service.js";

describe("DevToolsService", () => {
  it("clears the previously seeded paid invoice and completed order", async () => {
    let deletedInvoiceIds: string[] = [];
    let deletedOrderIds: string[] = [];
    const tx = {
      invoice: {
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          deletedInvoiceIds = where.id.in;
          return { count: 0 };
        },
      },
      workOrder: {
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          deletedOrderIds = where.id.in;
          return { count: 0 };
        },
      },
      category: { deleteMany: async () => ({ count: 0 }) },
      session: { deleteMany: async () => ({ count: 0 }) },
      user: { deleteMany: async () => ({ count: 0 }) },
    };
    const prisma = {
      $transaction: async (run: (transaction: object) => Promise<unknown>) => run(tx),
    };
    const service = new DevToolsService(prisma as unknown as PrismaService);

    await service.clearSeed();

    assert.ok(deletedInvoiceIds.includes("devtools-seed-v1-invoice-paid"));
    assert.ok(deletedOrderIds.includes("devtools-seed-v1-order-completed"));
    assert.ok(deletedInvoiceIds.includes("devtools-seed-v1-invoice-issued"));
  });
});
