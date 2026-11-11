import "../env.js";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ObjectStorageService } from "../storage/object-storage.service.js";
import { DevToolsService } from "./devtools.service.js";

const storage = {} as ObjectStorageService;

describe("DevTools", () => {
  describe("Seed cleanup", () => {
    it("clears payment reports and invoices before deleting seed orders and users", async () => {
      const calls: string[] = [];
      let deletedInvoiceIds: string[] = [];
      let deletedReportInvoiceIds: string[] = [];
      let deletedOrderIds: string[] = [];
      const tx = {
        invoice: {
          findMany: async ({ where }: { where: { orderId: { in: string[] } } }) => {
            calls.push("invoice.findMany");
            expect(where.orderId.in).toContain("devtools-seed-v1-order-invoiced");
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
        category: {
          deleteMany: async () => {
            calls.push("category.deleteMany");
            return { count: 0 };
          },
        },
        session: {
          deleteMany: async () => {
            calls.push("session.deleteMany");
            return { count: 0 };
          },
        },
        user: {
          deleteMany: async () => {
            calls.push("user.deleteMany");
            return { count: 0 };
          },
        },
      };
      const prisma = {
        $transaction: async (run: (transaction: object) => Promise<unknown>) => run(tx),
      };
      const service = new DevToolsService(prisma as unknown as PrismaService, storage);

      await service.clearSeed();

      expect(calls).toEqual([
        "invoice.findMany",
        "invoicePaymentReport.deleteMany",
        "invoice.deleteMany",
        "workOrder.deleteMany",
        "category.deleteMany",
        "session.deleteMany",
        "user.deleteMany",
      ]);
      expect(deletedReportInvoiceIds).toContain("devtools-seed-v1-invoice-issued");
      expect(deletedReportInvoiceIds).toContain("devtools-seed-v1-invoice-paid");
      expect(deletedReportInvoiceIds).toContain("invoice-created-during-testing");
      expect(deletedInvoiceIds).toContain("devtools-seed-v1-invoice-issued");
      expect(deletedInvoiceIds).toContain("invoice-created-during-testing");
      expect(deletedOrderIds).toContain("devtools-seed-v1-order-completed");
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

      await expect(service.clearSeed()).rejects.toThrow(ConflictException);
    });
  });

  describe("Reset", () => {
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

        expect(calls).toEqual([
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
        expect(created.user?.email).toBe("admin@example.test");
        expect(created.user?.role).toBe("ADMIN");
        expect(created.user?.isActive).toBe(true);
        expect(created.account?.providerId).toBe("credential");
        expect(created.account?.accountId).toBe("admin-id");
        expect(typeof created.account?.password).toBe("string");
        expect(created.account?.password).not.toBe("reset-password-123");
        expect(report.deleted).toEqual({
          users: 7,
          sessions: 5,
          verifications: 6,
          categories: 1,
          orders: 2,
          invoices: 3,
          paymentReports: 4,
          invoiceSequences: 1,
        });
        expect(report.admin).toEqual({ id: "admin-id", email: "admin@example.test" });
        expect(report.files).toEqual({ deleted: 12, failed: 0 });
        expect(purges).toBe(1);
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
      const prisma = {
        $transaction: async (run: (transaction: object) => Promise<unknown>) => run(tx),
      };
      let purges = 0;
      const service = new DevToolsService(prisma as unknown as PrismaService, {
        deleteAll: async () => {
          purges += 1;
          return { deleted: 0, failed: 0 };
        },
      } as unknown as ObjectStorageService);

      try {
        const report = await service.reset({ purgeFiles: false });

        expect(purges).toBe(0);
        expect(report.files).toBeNull();
        expect(calls).toContain("user.create");
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
        await expect(service.reset({ purgeFiles: true })).rejects.toThrow(BadRequestException);
        expect(touched).toBe(false);
      } finally {
        restoreEnv("ADMIN_EMAIL", previous.email);
        restoreEnv("ADMIN_PASSWORD", previous.password);
      }
    });
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
