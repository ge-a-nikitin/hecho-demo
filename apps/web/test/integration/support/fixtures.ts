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

/** An order card as `GET /orders/:id` serialises it, with only the fields the card reads. */
export type OrderDetailFixture = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: { name: string };
  customer: { name: string };
  executor: { name: string } | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  location: string | null;
  approvedHours: number | null;
  approvedHourlyRate: number | null;
  approvedAmount: number | null;
  cancellationReason: string | null;
  estimates: {
    id: string;
    hours: number;
    hourlyRate: number;
    amount: number;
    status: string;
    responseComment: string | null;
    proposedAt: string;
    respondedAt: string | null;
  }[];
  assignments: {
    id: string;
    outcome: string;
    assignedAt: string;
    endedAt: string | null;
  }[];
  statusHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
    changedBy: { id: string; name: string };
  }[];
  attachments: {
    id: string;
    filename: string;
    contentType: string | null;
    sizeBytes: number;
    createdAt: string;
  }[];
  comments: {
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string };
  }[];
  timeEntry: { minutes: number; comment: string | null; updatedAt: string } | null;
  invoices: {
    id: string;
    number: string;
    status: string;
    customerName: string;
    executorName: string;
    hours: number;
    hourlyRate: number;
    amount: number;
    currency: string;
    issuedAt: string;
    paidAt: string | null;
    voidedAt: string | null;
    voidReason: string | null;
    paymentReports?: {
      id: string;
      filename: string;
      status: string;
      reviewComment: string | null;
      submittedAt: string;
      reviewedAt: string | null;
    }[];
  }[];
};

export function orderDetail(
  overrides: Partial<OrderDetailFixture> & { id: string },
): OrderDetailFixture {
  return {
    title: "Kitchen tap replacement",
    description: "The cold water tap in the kitchen drips.",
    status: "NEW",
    category: { name: "Plumbing" },
    customer: { name: "Ada Lovelace" },
    executor: null,
    createdAt: "2026-01-05T10:00:00.000Z",
    updatedAt: "2026-01-05T10:00:00.000Z",
    submittedAt: null,
    acceptedAt: null,
    completedAt: null,
    dueAt: null,
    location: null,
    approvedHours: null,
    approvedHourlyRate: null,
    approvedAmount: null,
    cancellationReason: null,
    estimates: [],
    assignments: [],
    statusHistory: [],
    attachments: [],
    comments: [],
    timeEntry: null,
    invoices: [],
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
