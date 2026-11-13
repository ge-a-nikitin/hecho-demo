import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { EstimateStatus, InvoiceStatus, OrderStatus, UserRole } from "../generated/prisma/enums.js";
import { createFakeDatabase } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
import { withEnv } from "../test-support/with-env.js";
import { OrdersService } from "./orders.service.js";

const customer = { id: "customer-1", role: UserRole.CUSTOMER };
const otherCustomer = { id: "customer-2", role: UserRole.CUSTOMER };
const executor = { id: "executor-1", role: UserRole.EXECUTOR };
const administrator = { id: "admin-1", role: UserRole.ADMIN };

describe("Orders", () => {
  describe("Lifecycle", () => {
    it(
      qc("orders.lifecycle.executor-list-scope", "shows every role only the orders it may see"),
      async () => {
        const { service } = serviceWith({
          workOrder: [
            order({
              id: "assigned-to-me",
              executorId: executor.id,
              status: OrderStatus.ASSIGNED,
              createdAt: new Date("2026-01-03T10:00:00Z"),
            }),
            order({
              id: "in-the-pool",
              customerId: otherCustomer.id,
              status: OrderStatus.WAITING_DISTRIBUTION,
              createdAt: new Date("2026-01-04T10:00:00Z"),
            }),
            order({
              id: "assigned-to-someone-else",
              customerId: otherCustomer.id,
              executorId: "executor-2",
              status: OrderStatus.ASSIGNED,
              createdAt: new Date("2026-01-02T10:00:00Z"),
            }),
            order({
              id: "my-draft",
              status: OrderStatus.NEW,
              createdAt: new Date("2026-01-01T10:00:00Z"),
            }),
          ],
          invoice: [{ id: "invoice-1", orderId: "in-the-pool", status: InvoiceStatus.ISSUED }],
          invoicePaymentReport: [
            { id: "report-1", invoiceId: "invoice-1", filename: "receipt.pdf" },
          ],
        });

        const executorList = await service.list(executor);
        expect(executorList.map((entry) => entry.id)).toEqual(["in-the-pool", "assigned-to-me"]);

        const poolEntry = executorList[0] as { invoices?: { paymentReports?: unknown }[] };
        expect(poolEntry.invoices).toHaveLength(1);
        expect(poolEntry.invoices?.[0]?.paymentReports).toBeUndefined();

        expect((await service.list(administrator)).map((entry) => entry.id)).toEqual([
          "in-the-pool",
          "assigned-to-me",
          "assigned-to-someone-else",
          "my-draft",
        ]);
        expect((await service.list(customer)).map((entry) => entry.id)).toEqual([
          "assigned-to-me",
          "my-draft",
        ]);
      },
    );

    it(
      qc(
        "orders.lifecycle.foreign-order-access",
        "rejects customers who try to access another customer's order",
      ),
      async () => {
        const { service } = serviceWith({
          workOrder: [order({ id: "foreign-order", customerId: otherCustomer.id })],
        });

        await expect(service.get("foreign-order", customer)).rejects.toThrow(ForbiddenException);
        await expect(service.get("foreign-order", otherCustomer)).resolves.toMatchObject({
          id: "foreign-order",
        });
      },
    );

    it(
      qc(
        "orders.lifecycle.submit-to-pool",
        "submits unassigned drafts to the distribution pool and records the transition",
      ),
      async () => {
        const { db, service } = serviceWith({ workOrder: [order({ id: "order-1" })] });

        const submitted = await service.submit("order-1", customer);

        expect(submitted.status).toBe(OrderStatus.WAITING_DISTRIBUTION);
        expect(db.rows("workOrder")[0]).toMatchObject({
          id: "order-1",
          status: OrderStatus.WAITING_DISTRIBUTION,
          submittedAt: expect.any(Date),
        });
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            orderId: "order-1",
            changedById: customer.id,
            fromStatus: OrderStatus.NEW,
            toStatus: OrderStatus.WAITING_DISTRIBUTION,
          }),
        ]);
      },
    );

    it(
      qc(
        "orders.lifecycle.reject-estimate-comment",
        "requires a comment when a customer rejects an estimate",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [order({ id: "order-1", executorId: executor.id, status: OrderStatus.ASSIGNED })],
          orderEstimate: [
            { id: "estimate-1", orderId: "order-1", status: EstimateStatus.PENDING },
          ],
        });

        await expect(
          service.respondToEstimate("order-1", "estimate-1", { accepted: false }, customer),
        ).rejects.toThrow(BadRequestException);

        expect(db.rows("orderEstimate")).toEqual([
          expect.objectContaining({ id: "estimate-1", status: EstimateStatus.PENDING }),
        ]);
        expect(db.rows("orderStatusHistory")).toEqual([]);
      },
    );

    describe.each([OrderStatus.INVOICE_ISSUED, OrderStatus.INVOICE_PAID])(
      "cancelling an order in %s",
      (status) => {
        it(
          qc("orders.lifecycle.cancel-after-invoice", "does not allow cancelling an invoiced order"),
          async () => {
            const { db, service } = serviceWith({
              workOrder: [order({ id: "order-1", executorId: executor.id, status })],
            });

            await expect(
              service.cancel("order-1", "No longer needed", administrator),
            ).rejects.toThrow(ConflictException);

            expect(db.rows("workOrder")).toEqual([
              expect.objectContaining({ id: "order-1", status, cancellationReason: null }),
            ]);
            expect(db.rows("orderStatusHistory")).toEqual([]);
          },
        );
      },
    );

    it(
      qc(
        "orders.lifecycle.complete-requires-payment",
        "does not complete an order before payment is confirmed",
      ),
      async () => {
        const onReview = serviceWith({
          workOrder: [order({ id: "order-1", status: OrderStatus.ON_REVIEW })],
        });

        await expect(onReview.service.complete("order-1", administrator)).rejects.toThrow(
          ConflictException,
        );
        expect(onReview.db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.ON_REVIEW });
        expect(onReview.db.rows("orderStatusHistory")).toEqual([]);

        const unpaidInvoice = serviceWith({
          workOrder: [order({ id: "order-1", status: OrderStatus.INVOICE_PAID })],
          invoice: [{ id: "invoice-1", orderId: "order-1", status: InvoiceStatus.ISSUED }],
        });

        await expect(unpaidInvoice.service.complete("order-1", administrator)).rejects.toThrow(
          ConflictException,
        );
        expect(unpaidInvoice.db.rows("workOrder")[0]).toMatchObject({
          status: OrderStatus.INVOICE_PAID,
        });
        expect(unpaidInvoice.db.rows("orderStatusHistory")).toEqual([]);
      },
    );

    it(
      qc(
        "orders.lifecycle.complete-after-payment",
        "completes an order only after a paid invoice exists",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [order({ id: "order-1", status: OrderStatus.INVOICE_PAID })],
          invoice: [{ id: "invoice-1", orderId: "order-1", status: InvoiceStatus.PAID }],
        });

        const completed = await service.complete("order-1", administrator);

        expect(completed.status).toBe(OrderStatus.COMPLETED);
        expect(db.rows("workOrder")[0]).toMatchObject({
          status: OrderStatus.COMPLETED,
          completedAt: expect.any(Date),
        });
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            orderId: "order-1",
            changedById: administrator.id,
            fromStatus: OrderStatus.INVOICE_PAID,
            toStatus: OrderStatus.COMPLETED,
          }),
        ]);
      },
    );
  });

  describe("Quotas", () => {
    it(
      qc("orders.create.rejects-open-order-quota", "refuses a new order when the customer is at the open-order quota"),
      async () => {
        const { db, service } = await withEnv({ ORDER_OPEN_LIMIT: "2" }, () => {
          const created = serviceWith({
            category: [{ id: "category-1", name: "Plumbing", isActive: true }],
            workOrder: [
              order({ id: "order-1", status: OrderStatus.NEW }),
              order({ id: "order-2", status: OrderStatus.IN_PROGRESS }),
            ],
          });
          return created;
        });

        await expect(
          service.create(
            { title: "Fix the tap", description: "It drips", categoryId: "category-1" },
            customer,
          ),
        ).rejects.toThrow(ConflictException);

        expect(db.rows("workOrder")).toHaveLength(2);
      },
    );

    it(
      qc("orders.create.ignores-closed-orders", "does not count completed and cancelled orders against the quota"),
      async () => {
        const { db, service } = await withEnv({ ORDER_OPEN_LIMIT: "1" }, () =>
          serviceWith({
            category: [{ id: "category-1", name: "Plumbing", isActive: true }],
            workOrder: [
              order({ id: "order-1", status: OrderStatus.COMPLETED }),
              order({ id: "order-2", status: OrderStatus.CANCELLED }),
            ],
          }),
        );

        const created = await service.create(
          { title: "Fix the tap", description: "It drips", categoryId: "category-1" },
          customer,
        );

        expect(created).toMatchObject({ title: "Fix the tap", customerId: customer.id });
        expect(db.rows("workOrder")).toHaveLength(3);
      },
    );
  });
});

function serviceWith(seed: Parameters<typeof createFakeDatabase>[0] = {}) {
  const db = createFakeDatabase(seed);

  return { db, service: new OrdersService(db.prisma as unknown as PrismaService) };
}

function order(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "order-1",
    customerId: customer.id,
    executorId: null,
    status: OrderStatus.NEW,
    cancellationReason: null,
    ...overrides,
  };
}
