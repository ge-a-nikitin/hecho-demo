import "../env.js";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { OrderStatus, UserRole } from "../generated/prisma/enums.js";
import type { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";

describe("Orders", () => {
  describe("Lifecycle", () => {
    it(qc("orders.lifecycle.executor-list-scope", "limits executor order lists to assigned orders and the unassigned pool"), async () => {
      let query: Record<string, unknown> | undefined;
      const service = await createService({
        workOrder: {
          findMany: async (args: unknown) => {
            query = args as Record<string, unknown>;
            return [];
          },
        },
      });

      await service.list({ id: "executor-1", role: UserRole.EXECUTOR });

      expect(query?.where).toEqual({
        OR: [
          { executorId: "executor-1" },
          { status: OrderStatus.WAITING_DISTRIBUTION, executorId: null },
        ],
      });
      expect(query?.orderBy).toEqual({ createdAt: "desc" });
      const include = query?.include as {
        invoices?: { include?: Record<string, unknown> };
      };
      expect(include.invoices?.include?.paymentReports).toBeUndefined();
    });

    it(qc("orders.lifecycle.foreign-order-access", "rejects customers who try to access another customer's order"), async () => {
      const service = await createService({
        workOrder: {
          findUnique: async () => ({
            id: "order-1",
            customerId: "customer-2",
            executorId: null,
            status: OrderStatus.NEW,
          }),
        },
      });

      await expect(
        service.get("order-1", { id: "customer-1", role: UserRole.CUSTOMER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it(qc("orders.lifecycle.submit-to-pool", "submits unassigned drafts to the distribution pool and records the transition"), async () => {
      let updateArgs: Record<string, unknown> | undefined;
      let historyArgs: unknown;
      const order = {
        id: "order-1",
        customerId: "customer-1",
        executorId: null,
        status: OrderStatus.NEW,
      };
      const service = await createService({
        workOrder: {
          findUnique: async () => order,
        },
        $transaction: async (run: (tx: object) => Promise<unknown>) =>
          run({
            workOrder: {
              updateMany: async (args: unknown) => {
                updateArgs = args as Record<string, unknown>;
                return { count: 1 };
              },
              findUniqueOrThrow: async () => ({
                ...order,
                status: OrderStatus.WAITING_DISTRIBUTION,
              }),
            },
            orderStatusHistory: {
              create: async (args: unknown) => {
                historyArgs = args;
              },
            },
          }),
      });

      const result = await service.submit("order-1", {
        id: "customer-1",
        role: UserRole.CUSTOMER,
      });

      expect(result.status).toBe(OrderStatus.WAITING_DISTRIBUTION);
      expect(updateArgs?.where).toEqual({ id: "order-1", status: OrderStatus.NEW });
      expect((updateArgs?.data as Record<string, unknown>).status).toBe(
        OrderStatus.WAITING_DISTRIBUTION,
      );
      expect((updateArgs?.data as Record<string, unknown>).submittedAt).toBeInstanceOf(Date);
      expect(historyArgs).toEqual({
        data: {
          orderId: "order-1",
          changedById: "customer-1",
          fromStatus: OrderStatus.NEW,
          toStatus: OrderStatus.WAITING_DISTRIBUTION,
        },
      });
    });

    it(qc("orders.lifecycle.reject-estimate-comment", "requires a comment when a customer rejects an estimate"), async () => {
      let transactionCalled = false;
      const service = await createService({
        $transaction: async () => {
          transactionCalled = true;
          return {};
        },
      });

      await expect(
        service.respondToEstimate(
          "order-1",
          "estimate-1",
          { accepted: false },
          { id: "customer-1", role: UserRole.CUSTOMER },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(transactionCalled).toBe(false);
    });

    it.each([OrderStatus.INVOICE_ISSUED, OrderStatus.INVOICE_PAID])(
      qc("orders.lifecycle.cancel-after-invoice", "does not allow cancelling an order in %s"),
      async (status) => {
        let updateCalled = false;
        const service = await createService({
          $transaction: async (run: (tx: object) => Promise<unknown>) =>
            run({
              workOrder: {
                findUnique: async () => ({
                  id: "order-1",
                  customerId: "customer-1",
                  executorId: null,
                  status,
                }),
                updateMany: async () => {
                  updateCalled = true;
                  return { count: 1 };
                },
              },
            }),
        });

        await expect(
          service.cancel("order-1", "No longer needed", {
            id: "admin-1",
            role: UserRole.ADMIN,
          }),
        ).rejects.toThrow(ConflictException);
        expect(updateCalled).toBe(false);
      },
    );

    it(qc("orders.lifecycle.complete-requires-payment", "does not complete an order before payment is confirmed"), async () => {
      let invoiceQueried = false;
      const service = await createService({
        $transaction: async (run: (tx: object) => Promise<unknown>) =>
          run({
            workOrder: {
              findUnique: async () => ({ id: "order-1", status: OrderStatus.ON_REVIEW }),
            },
            invoice: {
              findFirst: async () => {
                invoiceQueried = true;
                return null;
              },
            },
          }),
      });

      await expect(
        service.complete("order-1", { id: "admin-1", role: UserRole.ADMIN }),
      ).rejects.toThrow(ConflictException);
      expect(invoiceQueried).toBe(false);
    });

    it(qc("orders.lifecycle.complete-after-payment", "completes an order only after a paid invoice exists"), async () => {
      let orderUpdate: Record<string, unknown> | undefined;
      let historyData: Record<string, unknown> | undefined;
      const service = await createService({
        $transaction: async (run: (tx: object) => Promise<unknown>) =>
          run({
            workOrder: {
              findUnique: async () => ({ id: "order-1", status: OrderStatus.INVOICE_PAID }),
              updateMany: async (args: { data: Record<string, unknown> }) => {
                orderUpdate = args.data;
                return { count: 1 };
              },
              findUniqueOrThrow: async () => ({ id: "order-1", status: OrderStatus.COMPLETED }),
            },
            invoice: {
              findFirst: async () => ({ id: "invoice-1" }),
            },
            orderStatusHistory: {
              create: async (args: { data: Record<string, unknown> }) => {
                historyData = args.data;
              },
            },
          }),
      });

      const order = await service.complete("order-1", {
        id: "admin-1",
        role: UserRole.ADMIN,
      });

      expect(order.status).toBe(OrderStatus.COMPLETED);
      expect(orderUpdate?.status).toBe(OrderStatus.COMPLETED);
      expect(orderUpdate?.completedAt).toBeInstanceOf(Date);
      expect(historyData?.fromStatus).toBe(OrderStatus.INVOICE_PAID);
      expect(historyData?.toStatus).toBe(OrderStatus.COMPLETED);
    });
  });

  async function createService(prisma: Record<string, unknown>) {
    return new OrdersService(prisma as unknown as PrismaService);
  }
});

