import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ObjectStorageService } from "../storage/object-storage.service.js";
import { DevToolsService } from "./devtools.service.js";

const storage = {} as ObjectStorageService;

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
    const service = new DevToolsService(prisma as unknown as PrismaService, storage);

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
    const service = new DevToolsService(prisma as unknown as PrismaService, storage);

    await assert.rejects(service.clearSeed(), ConflictException);
  });
});

describe("DevToolsService reset", () => {
  it("wipes every table in dependency order and recreates the administrator from the environment", async () => {
    const previous = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    process.env.ADMIN_EMAIL = " Admin@Example.Test ";
    process.env.ADMIN_PASSWORD = "reset-password-123";

    const calls: string[] = [];
    const { tx, created } = fakeTransaction(calls);
    const prisma = {
      $transaction: async (run: (transaction: object) => Promise<unknown>) => run(tx),
    };
    let purges = 0;
    const service = new DevToolsService(prisma as unknown as PrismaService, {
      deleteAll: async () => {
        purges += 1;
        return { deleted: 12, failed: 0 };
      },
    } as unknown as ObjectStorageService);

    try {
      const report = await service.reset({ purgeFiles: true });

      assert.deepEqual(calls, [
        "invoicePaymentReport.deleteMany",
        "invoice.deleteMany",
        "workOrder.deleteMany",
        "category.deleteMany",
        "session.deleteMany",
        "verification.deleteMany",
        "user.deleteMany",
        "invoiceSequence.deleteMany",
        "user.create",
        "account.create",
      ]);
      assert.equal(created.user?.email, "admin@example.test");
      assert.equal(created.user?.role, "ADMIN");
      assert.equal(created.user?.isActive, true);
      assert.equal(created.account?.providerId, "credential");
      assert.equal(created.account?.accountId, "admin-id");
      assert.equal(typeof created.account?.password, "string");
      assert.notEqual(created.account?.password, "reset-password-123");
      assert.deepEqual(report.deleted, {
        users: 7,
        sessions: 5,
        verifications: 6,
        categories: 1,
        orders: 2,
        invoices: 3,
        paymentReports: 4,
        invoiceSequences: 1,
      });
      assert.deepEqual(report.admin, { id: "admin-id", email: "admin@example.test" });
      assert.deepEqual(report.files, { deleted: 12, failed: 0 });
      assert.equal(purges, 1);
    } finally {
      restoreEnv("ADMIN_EMAIL", previous.email);
      restoreEnv("ADMIN_PASSWORD", previous.password);
    }
  });

  it("keeps stored files when the purge is not requested", async () => {
    const previous = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    process.env.ADMIN_EMAIL = "admin@example.test";
    process.env.ADMIN_PASSWORD = "reset-password-123";

    const calls: string[] = [];
    const { tx } = fakeTransaction(calls);
    const prisma = { $transaction: async (run: (transaction: object) => Promise<unknown>) => run(tx) };
    let purges = 0;
    const service = new DevToolsService(prisma as unknown as PrismaService, {
      deleteAll: async () => {
        purges += 1;
        return { deleted: 0, failed: 0 };
      },
    } as unknown as ObjectStorageService);

    try {
      const report = await service.reset({ purgeFiles: false });

      assert.equal(purges, 0);
      assert.equal(report.files, null);
      assert.ok(calls.includes("user.create"));
    } finally {
      restoreEnv("ADMIN_EMAIL", previous.email);
      restoreEnv("ADMIN_PASSWORD", previous.password);
    }
  });

  it("refuses to reset when the administrator credentials are not configured", async () => {
    const previous = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    process.env.ADMIN_EMAIL = "admin@example.test";
    delete process.env.ADMIN_PASSWORD;

    let touched = false;
    const prisma = {
      $transaction: async () => {
        touched = true;
      },
    };
    const service = new DevToolsService(prisma as unknown as PrismaService, storage);

    try {
      await assert.rejects(service.reset({ purgeFiles: true }), BadRequestException);
      assert.equal(touched, false);
    } finally {
      restoreEnv("ADMIN_EMAIL", previous.email);
      restoreEnv("ADMIN_PASSWORD", previous.password);
    }
  });
});

function fakeTransaction(calls: string[]): {
  tx: object;
  created: { user?: Record<string, unknown>; account?: Record<string, unknown> };
} {
  const counts: Record<string, number> = {
    invoicePaymentReport: 4,
    invoice: 3,
    workOrder: 2,
    category: 1,
    session: 5,
    verification: 6,
    user: 7,
    invoiceSequence: 1,
  };
  const created: { user?: Record<string, unknown>; account?: Record<string, unknown> } = {};

  const deletable = (name: string) => ({
    deleteMany: async () => {
      calls.push(`${name}.deleteMany`);
      return { count: counts[name] };
    },
  });

  const tx = {
    invoicePaymentReport: deletable("invoicePaymentReport"),
    invoice: deletable("invoice"),
    workOrder: deletable("workOrder"),
    category: deletable("category"),
    session: deletable("session"),
    verification: deletable("verification"),
    invoiceSequence: deletable("invoiceSequence"),
    user: {
      ...deletable("user"),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("user.create");
        created.user = data;
        return { id: "admin-id", email: data.email };
      },
    },
    account: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("account.create");
        created.account = data;
        return data;
      },
    },
  };

  return { tx, created };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

