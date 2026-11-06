import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OrderStatus, UserRole } from "../generated/prisma/enums.js";
import type { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";

describe("OrdersService", () => {
  it("limits executor order lists to assigned orders and the unassigned pool", async () => {
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

    assert.deepEqual(query?.where, {
      OR: [
        { executorId: "executor-1" },
        { status: OrderStatus.WAITING_DISTRIBUTION, executorId: null },
      ],
    });
    assert.deepEqual(query?.orderBy, { createdAt: "desc" });
    const include = query?.include as {
      invoices?: { include?: Record<string, unknown> };
    };
    assert.equal(include.invoices?.include?.paymentReports, undefined);
  });

  it("rejects customers who try to access another customer's order", async () => {
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

    await assert.rejects(
      service.get("order-1", { id: "customer-1", role: UserRole.CUSTOMER }),
      ForbiddenException,
    );
  });

  it("submits unassigned drafts to the distribution pool and records the transition", async () => {
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

    assert.equal(result.status, OrderStatus.WAITING_DISTRIBUTION);
    assert.deepEqual(updateArgs?.where, { id: "order-1", status: OrderStatus.NEW });
    assert.equal(
      (updateArgs?.data as Record<string, unknown>).status,
      OrderStatus.WAITING_DISTRIBUTION,
    );
    assert.ok((updateArgs?.data as Record<string, unknown>).submittedAt instanceof Date);
    assert.deepEqual(historyArgs, {
      data: {
        orderId: "order-1",
        changedById: "customer-1",
        fromStatus: OrderStatus.NEW,
        toStatus: OrderStatus.WAITING_DISTRIBUTION,
      },
    });
  });

  it("requires a comment when a customer rejects an estimate", async () => {
    let transactionCalled = false;
    const service = await createService({
      $transaction: async () => {
        transactionCalled = true;
        return {};
      },
    });

    await assert.rejects(
      service.respondToEstimate(
        "order-1",
        "estimate-1",
        { accepted: false },
        { id: "customer-1", role: UserRole.CUSTOMER },
      ),
      BadRequestException,
    );
    assert.equal(transactionCalled, false);
  });

  it("completes an order only after a paid invoice exists", async () => {
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

    assert.equal(order.status, OrderStatus.COMPLETED);
    assert.equal(orderUpdate?.status, OrderStatus.COMPLETED);
    assert.ok(orderUpdate?.completedAt instanceof Date);
    assert.equal(historyData?.fromStatus, OrderStatus.INVOICE_PAID);
    assert.equal(historyData?.toStatus, OrderStatus.COMPLETED);
  });

  async function createService(prisma: Record<string, unknown>) {
    return new OrdersService(prisma as unknown as PrismaService);
  }
});
