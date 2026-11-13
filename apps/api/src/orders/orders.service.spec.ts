import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
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

  describe("Distribution", () => {
    it(
      qc(
        "orders.assign.restarts-started-work",
        "returns work in progress to the assignment stage for the new executor",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [
            order({
              id: "order-1",
              executorId: executor.id,
              status: OrderStatus.IN_PROGRESS,
              approvedHours: 2.5,
              approvedHourlyRate: 60,
              approvedAmount: 150,
            }),
          ],
          user: [
            { id: "executor-2", name: "Second Executor", role: UserRole.EXECUTOR, isActive: true },
          ],
          orderAssignment: [
            { id: "assignment-1", orderId: "order-1", executorId: executor.id, outcome: "ACTIVE" },
          ],
          orderEstimate: [{ id: "estimate-1", orderId: "order-1", status: EstimateStatus.ACCEPTED }],
        });

        const reassigned = await service.assign("order-1", "executor-2", administrator);

        expect(reassigned).toMatchObject({
          id: "order-1",
          status: OrderStatus.ASSIGNED,
          executorId: "executor-2",
          approvedHours: null,
          approvedHourlyRate: null,
          approvedAmount: null,
        });
        expect(db.rows("orderAssignment")).toEqual([
          expect.objectContaining({
            id: "assignment-1",
            executorId: executor.id,
            outcome: "REASSIGNED",
            endedAt: expect.any(Date),
          }),
          expect.objectContaining({
            orderId: "order-1",
            executorId: "executor-2",
            outcome: "ACTIVE",
            assignedById: administrator.id,
          }),
        ]);
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            orderId: "order-1",
            changedById: administrator.id,
            fromStatus: OrderStatus.IN_PROGRESS,
            toStatus: OrderStatus.ASSIGNED,
          }),
        ]);
        // The accepted estimate stays as history; the new executor has to
        // propose a fresh one before any amount can be invoiced.
        expect(db.rows("orderEstimate")).toEqual([
          expect.objectContaining({ id: "estimate-1", status: EstimateStatus.ACCEPTED }),
        ]);
      },
    );

    it(
      qc(
        "orders.assign.reassigns-with-history",
        "assigns a pooled order and moves a later reassignment into the history",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [order({ id: "order-1", status: OrderStatus.WAITING_DISTRIBUTION })],
          user: [
            { id: "executor-1", name: "First Executor", role: UserRole.EXECUTOR, isActive: true },
            { id: "executor-2", name: "Second Executor", role: UserRole.EXECUTOR, isActive: true },
          ],
          orderEstimate: [{ id: "estimate-1", orderId: "order-1", status: EstimateStatus.PENDING }],
        });

        const assigned = await service.assign("order-1", "executor-1", administrator);
        const reassigned = await service.assign("order-1", "executor-2", administrator);

        expect(assigned).toMatchObject({ status: OrderStatus.ASSIGNED, executorId: "executor-1" });
        expect(reassigned).toMatchObject({ status: OrderStatus.ASSIGNED, executorId: "executor-2" });
        expect(db.rows("orderAssignment")).toEqual([
          expect.objectContaining({
            executorId: "executor-1",
            outcome: "REASSIGNED",
            assignedById: administrator.id,
            endedAt: expect.any(Date),
          }),
          expect.objectContaining({
            executorId: "executor-2",
            outcome: "ACTIVE",
            assignedById: administrator.id,
          }),
        ]);
        expect(db.rows("orderEstimate")).toEqual([
          expect.objectContaining({
            id: "estimate-1",
            status: EstimateStatus.WITHDRAWN,
            responseComment: "Withdrawn because the order was reassigned by an administrator",
          }),
        ]);
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            fromStatus: OrderStatus.WAITING_DISTRIBUTION,
            toStatus: OrderStatus.ASSIGNED,
            changedById: administrator.id,
          }),
          expect.objectContaining({
            fromStatus: OrderStatus.ASSIGNED,
            toStatus: OrderStatus.ASSIGNED,
            note: "Executor reassigned by administrator",
          }),
        ]);
      },
    );

    it(
      qc(
        "orders.assign.requires-active-executor",
        "refuses an inactive executor, the current one and a closed order",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [order({ id: "order-1", status: OrderStatus.WAITING_DISTRIBUTION })],
          user: [
            { id: "executor-1", name: "First Executor", role: UserRole.EXECUTOR, isActive: true },
            { id: "executor-2", name: "Retired Executor", role: UserRole.EXECUTOR, isActive: false },
          ],
        });

        await expect(service.assign("order-1", "executor-2", administrator)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.assign("order-1", "executor-missing", administrator)).rejects.toThrow(
          BadRequestException,
        );

        await expect(service.assign("order-1", "executor-1", administrator)).resolves.toMatchObject({
          executorId: "executor-1",
        });
        await expect(service.assign("order-1", "executor-1", administrator)).rejects.toThrow(
          ConflictException,
        );

        const closed = serviceWith({
          workOrder: [order({ id: "order-2", status: OrderStatus.COMPLETED })],
          user: [
            { id: "executor-1", name: "First Executor", role: UserRole.EXECUTOR, isActive: true },
          ],
        });
        await expect(closed.service.assign("order-2", "executor-1", administrator)).rejects.toThrow(
          ConflictException,
        );

        expect(db.rows("orderAssignment")).toEqual([
          expect.objectContaining({ orderId: "order-1", executorId: "executor-1", outcome: "ACTIVE" }),
        ]);
        expect(closed.db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.COMPLETED });
      },
    );
  });

  describe("Draft editing", () => {
    it(
      qc(
        "orders.draft.update-fields",
        "stores the edited draft with trimmed values and releases the executor the customer detaches",
      ),
      async () => {
        const { db, service } = serviceWith({
          category: [{ id: "category-1", name: "Plumbing", isActive: true }],
          workOrder: [
            order({
              id: "order-1",
              executorId: executor.id,
              status: OrderStatus.NEW,
              title: "Old title",
              location: "Old address",
            }),
          ],
          orderAssignment: [
            { id: "assignment-1", orderId: "order-1", executorId: executor.id, outcome: "ACTIVE" },
          ],
        });

        const updated = await service.updateDraft(
          "order-1",
          { title: "  New title  ", location: "  ", categoryId: "category-1", executorId: null },
          customer,
        );

        expect(updated).toMatchObject({
          title: "New title",
          location: null,
          executorId: null,
          categoryId: "category-1",
          status: OrderStatus.NEW,
        });
        expect(db.rows("orderAssignment")).toEqual([
          expect.objectContaining({
            id: "assignment-1",
            outcome: "RELEASED",
            endedAt: expect.any(Date),
          }),
        ]);
      },
    );

    it(
      qc(
        "orders.draft.refuses-invalid-edits",
        "refuses to edit a submitted draft, another customer's order and an unavailable category",
      ),
      async () => {
        const submitted = serviceWith({
          workOrder: [order({ id: "order-1", status: OrderStatus.ASSIGNED })],
        });
        const foreign = serviceWith({
          workOrder: [order({ id: "order-2", customerId: otherCustomer.id })],
        });
        const retiredCategory = serviceWith({
          workOrder: [order({ id: "order-3" })],
          category: [{ id: "category-1", name: "Retired", isActive: false }],
        });

        await expect(
          submitted.service.updateDraft("order-1", { title: "Changed" }, customer),
        ).rejects.toThrow(ConflictException);
        await expect(
          foreign.service.updateDraft("order-2", { title: "Changed" }, customer),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          retiredCategory.service.updateDraft("order-3", { categoryId: "category-1" }, customer),
        ).rejects.toThrow(BadRequestException);

        expect(submitted.db.rows("workOrder")[0]).toMatchObject({ status: OrderStatus.ASSIGNED });
        expect(foreign.db.rows("workOrder")[0]).toMatchObject({ customerId: otherCustomer.id });
        expect(retiredCategory.db.rows("workOrder")[0].categoryId).toBeUndefined();
      },
    );
  });

  describe("Estimates", () => {
    it(
      qc(
        "orders.estimates.requires-rate",
        "refuses an estimate from an executor without a positive hourly rate",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [
            order({ id: "order-1", executorId: executor.id, status: OrderStatus.ASSIGNED }),
          ],
          user: [
            {
              id: executor.id,
              name: "Executor",
              role: UserRole.EXECUTOR,
              isActive: true,
              hourlyRate: null,
            },
          ],
        });

        await expect(service.proposeEstimate("order-1", 2, executor)).rejects.toThrow(
          BadRequestException,
        );

        expect(db.rows("orderEstimate")).toEqual([]);
      },
    );

    it(
      qc(
        "orders.estimates.amount-from-rate",
        "multiplies the stored rate by the proposed hours and keeps the rate of the proposal",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [
            order({ id: "order-1", executorId: executor.id, status: OrderStatus.ASSIGNED }),
            order({ id: "order-2", executorId: executor.id, status: OrderStatus.ASSIGNED }),
          ],
          user: [
            {
              id: executor.id,
              name: "Executor",
              role: UserRole.EXECUTOR,
              isActive: true,
              hourlyRate: new Prisma.Decimal(45.5),
            },
          ],
        });

        const first = await service.proposeEstimate("order-1", 2.25, executor);

        expect(String(first.hours)).toBe("2.25");
        expect(String(first.hourlyRate)).toBe("45.5");
        // 45.5 x 2.25 = 102.375, rounded half up to two decimals.
        expect(String(first.amount)).toBe("102.38");
        expect(first).toMatchObject({ status: EstimateStatus.PENDING });

        const prisma = db.prisma as unknown as {
          user: {
            update: (args: {
              where: { id: string };
              data: Record<string, unknown>;
            }) => Promise<unknown>;
          };
        };
        await prisma.user.update({
          where: { id: executor.id },
          data: { hourlyRate: new Prisma.Decimal(99) },
        });
        const second = await service.proposeEstimate("order-2", 1, executor);

        expect(String(second.hourlyRate)).toBe("99");
        expect(db.rows("orderEstimate")[0]).toMatchObject({
          id: first.id,
          hourlyRate: first.hourlyRate,
        });
      },
    );

    it(
      qc(
        "orders.estimates.single-pending",
        "answers conflict when a proposal is already waiting for the customer",
      ),
      async () => {
        const { db, service } = serviceWith(
          {
            workOrder: [
              order({ id: "order-1", executorId: executor.id, status: OrderStatus.ASSIGNED }),
            ],
            user: [
              {
                id: executor.id,
                name: "Executor",
                role: UserRole.EXECUTOR,
                isActive: true,
                hourlyRate: new Prisma.Decimal(60),
              },
            ],
          },
          { failOn: { table: "orderEstimate", operation: "create", code: "P2002" } },
        );

        await expect(service.proposeEstimate("order-1", 2, executor)).rejects.toThrow(
          ConflictException,
        );

        expect(db.rows("orderEstimate")).toEqual([]);
      },
    );
  });

  describe("Acceptance and cancellation", () => {
    it(
      qc("orders.lifecycle.accept-once", "accepts the work once and refuses a second acceptance"),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [
            order({ id: "order-1", executorId: executor.id, status: OrderStatus.ON_REVIEW }),
          ],
        });

        const accepted = await service.acceptWork("order-1", customer);

        expect(accepted).toMatchObject({
          status: OrderStatus.ON_REVIEW,
          acceptedAt: expect.any(Date),
        });
        await expect(service.acceptWork("order-1", customer)).rejects.toThrow(ConflictException);
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            fromStatus: OrderStatus.ON_REVIEW,
            toStatus: OrderStatus.ON_REVIEW,
            note: "Work accepted by customer",
          }),
        ]);
      },
    );

    it(
      qc(
        "orders.cancel.releases-assignment",
        "cancels a started assignment without a reason and withdraws the estimate awaiting the customer",
      ),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [
            order({ id: "order-1", executorId: executor.id, status: OrderStatus.ASSIGNED }),
          ],
          orderAssignment: [
            { id: "assignment-1", orderId: "order-1", executorId: executor.id, outcome: "ACTIVE" },
          ],
          orderEstimate: [
            { id: "estimate-1", orderId: "order-1", status: EstimateStatus.PENDING },
          ],
        });

        const cancelled = await service.cancel("order-1", undefined, customer);

        expect(cancelled).toMatchObject({
          status: OrderStatus.CANCELLED,
          cancellationReason: null,
        });
        expect(db.rows("orderAssignment")[0]).toMatchObject({
          outcome: "RELEASED",
          endedAt: expect.any(Date),
        });
        expect(db.rows("orderEstimate")[0]).toMatchObject({
          status: EstimateStatus.WITHDRAWN,
          responseComment: "Withdrawn because the order was cancelled",
        });
        expect(db.rows("orderStatusHistory")).toEqual([
          expect.objectContaining({
            fromStatus: OrderStatus.ASSIGNED,
            toStatus: OrderStatus.CANCELLED,
            note: null,
          }),
        ]);
      },
    );
  });

  describe("Comments", () => {
    it(
      qc("orders.comments.participants-only", "records a comment from a participant and refuses an outsider"),
      async () => {
        const { db, service } = serviceWith({
          workOrder: [
            order({ id: "order-1", executorId: executor.id, status: OrderStatus.IN_PROGRESS }),
          ],
        });

        const comment = await service.addComment(
          "order-1",
          { content: "  The spare part has arrived  " },
          customer,
        );

        expect(comment).toMatchObject({
          content: "The spare part has arrived",
          authorId: customer.id,
        });
        await expect(
          service.addComment("order-1", { content: "Not my order" }, otherCustomer),
        ).rejects.toThrow(ForbiddenException);
        expect(db.rows("orderComment")).toEqual([
          expect.objectContaining({
            orderId: "order-1",
            content: "The spare part has arrived",
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

function serviceWith(
  seed: Parameters<typeof createFakeDatabase>[0] = {},
  options: Parameters<typeof createFakeDatabase>[1] = {},
) {
  const db = createFakeDatabase(seed, options);

  return { db, service: new OrdersService(db.prisma as unknown as PrismaService) };
}

function order(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "order-1",
    customerId: customer.id,
    executorId: null,
    status: OrderStatus.NEW,
    cancellationReason: null,
    acceptedAt: null,
    ...overrides,
  };
}
