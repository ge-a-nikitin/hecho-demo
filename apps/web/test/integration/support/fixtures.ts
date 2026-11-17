import type { FakeRoute } from "./fake-api";

/** A customer order as the api serialises it, with only the fields a panel reads. */
export type OrderFixture = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: { id: string; name: string };
  customer: { id: string; name: string };
  executor: { id: string; name: string } | null;
  createdAt: string;
  dueAt: string | null;
  location: string | null;
  acceptedAt: string | null;
  estimates: { id: string; hours: number; amount: number; status: string }[];
  invoices: {
    id: string;
    number: string;
    amount: number;
    status: string;
    paymentReports?: {
      id: string;
      filename: string;
      status: string;
      reviewComment: string | null;
      submittedAt: string;
    }[];
  }[];
  timeEntry: { minutes: number; comment: string | null } | null;
};

export function order(overrides: Partial<OrderFixture> & { id: string }): OrderFixture {
  return {
    title: "Kitchen tap replacement",
    description: "The cold water tap in the kitchen drips.",
    status: "NEW",
    category: { id: "plumbing", name: "Plumbing" },
    customer: { id: "customer-1", name: "Ada Lovelace" },
    executor: null,
    createdAt: "2026-01-05T10:00:00.000Z",
    dueAt: null,
    location: null,
    acceptedAt: null,
    estimates: [],
    invoices: [],
    timeEntry: null,
    ...overrides,
  };
}

/** The three requests the customer panel makes when it mounts. */
export function customerPanelRoutes(orders: OrderFixture[]): Record<string, FakeRoute> {
  return {
    "GET /orders": { body: orders },
    "GET /categories": { body: [{ id: "plumbing", name: "Plumbing" }] },
    "GET /users/executors/available": { body: [{ id: "executor-1", name: "Grace Hopper" }] },
  };
}
