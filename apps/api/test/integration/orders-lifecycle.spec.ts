import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { qc } from "../../src/test-support/qase-case.js";
import {
  createActor,
  request,
  resetWorld,
  signInAdmin,
  waitForApi,
  type Actor,
} from "./helpers/stack.js";

/**
 * Integration suite for the Orders feature against the real HTTP API, a real
 * PostgreSQL database and real transactions. It covers what the unit tests
 * cannot: conditional updates that decide a race, row locking, and the
 * multi-step lifecycle state machine.
 */

const HOURLY_RATE = 60;

type StatusEntry = { fromStatus: string | null; toStatus: string; note: string | null };

type Order = {
  id: string;
  status: string;
  customerId: string;
  executorId: string | null;
  categoryId: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  cancellationReason: string | null;
  statusHistory: StatusEntry[];
  estimates: Array<{ id: string; status: string; hours: string; amount: string }>;
  assignments: Array<{ executorId: string; outcome: string }>;
  comments: Array<{ content: string }>;
  timeEntry: { minutes: number } | null;
};

type ApiError = { statusCode: number; code: string; message: string | string[]; error: string };

let admin: Actor;
let customerA: Actor;
let customerB: Actor;
let executorA: Actor;
let executorB: Actor;
let categoryId: string;
let titleCounter = 0;

beforeAll(async () => {
  await waitForApi();
  await resetWorld();

  admin = await signInAdmin();
  const category = await admin.post<{ id: string }>("/categories", {
    name: `Integration ${randomUUID()}`,
  });
  expect(category.status).toBe(201);
  categoryId = category.body.id;

  customerA = await createActor("CUSTOMER");
  customerB = await createActor("CUSTOMER");
  executorA = await createActor("EXECUTOR");
  executorB = await createActor("EXECUTOR");

  // Estimates need a positive hourly rate on the executor account.
  for (const executor of [executorA, executorB]) {
    const rate = await executor.patch("/users/me/hourly-rate", { hourlyRate: HOURLY_RATE });
    expect(rate.status).toBe(200);
  }
});

function nextTitle(): string {
  titleCounter += 1;
  return `Integration order ${titleCounter}`;
}

async function createDraft(customer: Actor = customerA, executorId?: string): Promise<Order> {
  const response = await customer.post<Order>("/orders", {
    title: nextTitle(),
    description: "Created by the integration suite",
    categoryId,
    ...(executorId === undefined ? {} : { executorId }),
  });
  expect(response.status).toBe(201);
  return response.body;
}

async function submitDraft(order: Order): Promise<Order> {
  const response = await customerA.post<Order>(`/orders/${order.id}/submit`);
  expect(response.status).toBe(201);
  return response.body;
}

async function draftAssignedTo(executor: Actor): Promise<Order> {
  const submitted = await submitDraft(await createDraft(customerA, executor.id));
  expect(submitted.status).toBe("ASSIGNED");
  return submitted;
}

async function orderInProgress(): Promise<Order> {
  const order = await draftAssignedTo(executorA);
  const estimate = await executorA.post<{ id: string }>(`/orders/${order.id}/estimate`, {
    hours: 2,
  });
  expect(estimate.status).toBe(201);

  const accepted = await customerA.post<{ order: Order }>(
    `/orders/${order.id}/estimates/${estimate.body.id}/respond`,
    { accepted: true },
  );
  expect(accepted.status).toBe(201);
  expect(accepted.body.order.status).toBe("IN_PROGRESS");
  return accepted.body.order;
}

describe("Orders (integration)", () => {
  describe("Lifecycle", () => {
    it(qc("integration.lifecycle.create-draft", "creates a draft order for the current customer"), async () => {
      const draft = await createDraft();

      expect(draft).toMatchObject({
        status: "NEW",
        customerId: customerA.id,
        executorId: null,
        categoryId,
      });
      expect(draft.statusHistory.map((entry) => entry.toStatus)).toEqual(["NEW"]);
      expect(draft.statusHistory[0].fromStatus).toBeNull();
    });

    it(qc("integration.lifecycle.unknown-category", "rejects a draft that references an unavailable category"), async () => {
      const response = await customerA.post<ApiError>("/orders", {
        title: nextTitle(),
        description: "This category does not exist",
        categoryId: `missing-${randomUUID()}`,
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: "BAD_REQUEST",
        message: "Category is not available",
      });
    });

    it(qc("integration.lifecycle.submit-to-pool", "moves a submitted draft into the executor pool"), async () => {
      const submitted = await submitDraft(await createDraft());

      expect(submitted.status).toBe("WAITING_DISTRIBUTION");
      expect(submitted.executorId).toBeNull();
      expect(submitted.submittedAt).not.toBeNull();
      expect(submitted.statusHistory.map((entry) => entry.toStatus)).toEqual([
        "NEW",
        "WAITING_DISTRIBUTION",
      ]);
    });

    it(qc("integration.lifecycle.concurrent-claim", "grants a pooled order to exactly one of two concurrent claims"), async () => {
      const pooled = await submitDraft(await createDraft());

      const responses = await Promise.all([
        executorA.post<Order>(`/orders/${pooled.id}/claim`),
        executorB.post<Order>(`/orders/${pooled.id}/claim`),
      ]);
      const claimed = responses.filter((response) => response.status === 201);
      const refused = responses.filter((response) => response.status === 409);

      expect(claimed).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect([executorA.id, executorB.id]).toContain(claimed[0].body.executorId);
      expect(refused[0].body).toMatchObject({
        code: "CONFLICT",
        message: "Order is no longer available in the pool",
      });

      const stored = await customerA.get<Order>(`/orders/${pooled.id}`);
      expect(stored.body.status).toBe("ASSIGNED");
      expect(stored.body.assignments).toHaveLength(1);
      expect(
        stored.body.statusHistory.filter((entry) => entry.toStatus === "ASSIGNED"),
      ).toHaveLength(1);
    });

    it(qc("integration.lifecycle.accept-estimate", "accepts an estimate and drives the order to customer acceptance"), async () => {
      const order = await draftAssignedTo(executorA);
      const estimate = await executorA.post<{ id: string; status: string; amount: string }>(
        `/orders/${order.id}/estimate`,
        { hours: 2.5 },
      );

      expect(estimate.status).toBe(201);
      expect(estimate.body.status).toBe("PENDING");
      expect(Number(estimate.body.amount)).toBe(2.5 * HOURLY_RATE);

      const accepted = await customerA.post<{ estimate: { status: string }; order: Order }>(
        `/orders/${order.id}/estimates/${estimate.body.id}/respond`,
        { accepted: true, comment: "Agreed, please start on Monday" },
      );
      expect(accepted.status).toBe(201);
      expect(accepted.body.estimate.status).toBe("ACCEPTED");
      expect(accepted.body.order.status).toBe("IN_PROGRESS");

      const time = await executorA.post<{ minutes: number }>(`/orders/${order.id}/time`, {
        minutes: 150,
      });
      expect(time.status).toBe(201);
      expect(time.body.minutes).toBe(150);

      const review = await executorA.post<Order>(`/orders/${order.id}/submit-review`);
      expect(review.status).toBe(201);
      expect(review.body.status).toBe("ON_REVIEW");
      expect(review.body.timeEntry?.minutes).toBe(150);

      const acceptedWork = await customerA.post<Order>(`/orders/${order.id}/accept`);
      expect(acceptedWork.status).toBe(201);
      expect(acceptedWork.body.status).toBe("ON_REVIEW");
      expect(acceptedWork.body.acceptedAt).not.toBeNull();
    });

    it(qc("integration.lifecycle.revision", "returns work for revision and lets the executor resume it"), async () => {
      const order = await orderInProgress();
      const review = await executorA.post<Order>(`/orders/${order.id}/submit-review`);
      expect(review.status).toBe(201);

      const revision = await customerA.post<Order>(`/orders/${order.id}/request-revision`, {
        comment: "Please repaint the window frame",
      });
      expect(revision.status).toBe(201);
      expect(revision.body.status).toBe("NEEDS_REVISION");
      expect(revision.body.comments.map((comment) => comment.content)).toContain(
        "Please repaint the window frame",
      );

      const resumed = await executorA.post<Order>(`/orders/${order.id}/resume-revisions`);
      expect(resumed.status).toBe(201);
      expect(resumed.body.status).toBe("IN_PROGRESS");
    });

    it(qc("integration.lifecycle.reject-estimate", "rejects an estimate and returns the order to the pool"), async () => {
      const order = await draftAssignedTo(executorA);
      const estimate = await executorA.post<{ id: string }>(`/orders/${order.id}/estimate`, {
        hours: 4,
      });
      expect(estimate.status).toBe(201);

      const rejected = await customerA.post<{ estimate: { status: string }; order: Order }>(
        `/orders/${order.id}/estimates/${estimate.body.id}/respond`,
        { accepted: false, comment: "Too expensive" },
      );

      expect(rejected.status).toBe(201);
      expect(rejected.body.estimate.status).toBe("REJECTED");
      expect(rejected.body.order.status).toBe("WAITING_DISTRIBUTION");
      expect(rejected.body.order.executorId).toBeNull();
      expect(rejected.body.order.assignments[0]).toMatchObject({
        executorId: executorA.id,
        outcome: "RELEASED",
      });
    });

    it(qc("integration.lifecycle.cancel-reason", "requires a reason when an administrator cancels work in progress"), async () => {
      const order = await orderInProgress();

      const customerRefused = await customerA.post<ApiError>(`/orders/${order.id}/cancel`, {
        reason: "The customer changed plans",
      });
      expect(customerRefused.status).toBe(403);
      expect(customerRefused.body).toMatchObject({
        code: "FORBIDDEN",
        message: "Customers can cancel only their own orders before work starts",
      });

      const refused = await admin.post<ApiError>(`/orders/${order.id}/cancel`, {});
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({
        code: "BAD_REQUEST",
        message: "A cancellation reason is required after work has started",
      });

      const cancelled = await admin.post<Order>(`/orders/${order.id}/cancel`, {
        reason: "The customer changed plans",
      });
      expect(cancelled.status).toBe(201);
      expect(cancelled.body.status).toBe("CANCELLED");
      expect(cancelled.body.cancellationReason).toBe("The customer changed plans");
    });
  });

  describe("Access control", () => {
    it(qc("integration.access-control.no-session", "rejects requests without a session"), async () => {
      const response = await request<ApiError>("GET", "/orders");

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
    });

    it(qc("integration.access-control.foreign-order", "hides a customer order from another customer"), async () => {
      const draft = await createDraft();

      const response = await customerB.get<ApiError>(`/orders/${draft.id}`);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: "FORBIDDEN",
        message: "You cannot access this order",
      });

      const list = await customerB.get<Order[]>("/orders");
      expect(list.body.map((order) => order.id)).not.toContain(draft.id);
    });

    it(qc("integration.access-control.pool-visibility", "shows a pooled order to executors and hides it once it is claimed"), async () => {
      const pooled = await submitDraft(await createDraft());

      const visible = await executorA.get<Order>(`/orders/${pooled.id}`);
      expect(visible.status).toBe(200);
      expect(visible.body.status).toBe("WAITING_DISTRIBUTION");

      const claim = await executorB.post<Order>(`/orders/${pooled.id}/claim`);
      expect(claim.status).toBe(201);

      const hidden = await executorA.get<ApiError>(`/orders/${pooled.id}`);
      expect(hidden.status).toBe(403);
    });

    it(qc("integration.access-control.executor-create", "refuses order creation for an executor"), async () => {
      const response = await executorA.post<ApiError>("/orders", {
        title: nextTitle(),
        description: "Executors cannot create orders",
        categoryId,
      });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: "FORBIDDEN",
        message: "This role cannot access the requested resource",
      });
    });

    it(qc("integration.access-control.customer-complete", "refuses administrative completion for a customer"), async () => {
      const draft = await createDraft();

      const response = await customerA.post<ApiError>(`/orders/${draft.id}/complete`);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("Request validation", () => {
    it(qc("integration.validation.unknown-fields", "rejects unknown fields instead of ignoring them"), async () => {
      const response = await customerA.post<ApiError>("/orders", {
        title: nextTitle(),
        description: "An unknown field must not be silently dropped",
        categoryId,
        priority: "urgent",
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("BAD_REQUEST");
      expect(response.body.message).toEqual(
        expect.arrayContaining(["property priority should not exist"]),
      );
    });

    it(qc("integration.validation.whitespace-title", "rejects a title that contains only whitespace"), async () => {
      const response = await customerA.post<ApiError>("/orders", {
        title: "   ",
        description: "The title is blank",
        categoryId,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("title")]),
      );
    });

    it(qc("integration.validation.deadline-format", "rejects a deadline that is not an ISO-8601 date"), async () => {
      const response = await customerA.post<ApiError>("/orders", {
        title: nextTitle(),
        description: "The deadline is malformed",
        categoryId,
        dueAt: "tomorrow",
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("dueAt")]),
      );
    });
  });
});
