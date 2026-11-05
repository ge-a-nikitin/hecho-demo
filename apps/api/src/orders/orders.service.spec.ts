import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
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

  async function createService(prisma: Record<string, unknown>) {
    return new OrdersService(prisma as unknown as PrismaService);
  }
});
