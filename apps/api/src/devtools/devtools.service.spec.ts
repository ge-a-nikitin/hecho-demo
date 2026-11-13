import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AssignmentOutcome,
  InvoiceStatus,
  OrderStatus,
  UserRole,
} from "../generated/prisma/enums.js";
import type { ObjectStorageService } from "../storage/object-storage.service.js";
import { createFakeDatabase, type FakeDatabase } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
import { withEnv } from "../test-support/with-env.js";
import { DevToolsService } from "./devtools.service.js";

/**
 * Signing up belongs to Better Auth, so its call is the boundary this suite
 * replaces; the rows it would write land in the fake database through the mock
 * below, which lets a case assert what the devtools left behind.
 */
const signUpEmail = vi.hoisted(() => vi.fn());

vi.mock("../auth/auth.js", () => ({ auth: { api: { signUpEmail } } }));

describe("DevTools", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
  });

  describe("Seed cleanup", () => {
    it(
      qc(
        "devtools.seed-cleanup.order",
        "clears payment reports and invoices before deleting seed orders and users",
      ),
      async () => {
        const { db, service } = devToolsService({
          user: [
            userRow({ id: "devtools-seed-v1-admin", role: UserRole.ADMIN, email: adminEmail }),
            userRow(),
            userRow({
              id: "devtools-seed-v1-executor",
              role: UserRole.EXECUTOR,
              email: executorEmail,
            }),
            userRow({ id: "user-survivor", email: "survivor@example.test" }),
          ],
          category: [categoryRow(), categoryRow({ id: "category-survivor", name: "Campaign" })],
          workOrder: [
            orderRow(),
            orderRow({ id: "devtools-seed-v1-order-completed", status: OrderStatus.COMPLETED }),
            orderRow({ id: "order-created-during-testing", customerId: "user-survivor" }),
          ],
          invoice: [
            invoiceRow(),
            invoiceRow({ id: "devtools-seed-v1-invoice-paid", number: "DEV-SEED-2025-0001" }),
            invoiceRow({ id: "invoice-created-during-testing", number: "TEST-0001" }),
            invoiceRow({
              id: "invoice-of-testing-campaign",
              orderId: "order-created-during-testing",
              number: "TEST-0002",
            }),
          ],
          invoicePaymentReport: [
            paymentReportRow({ id: "report-issued" }),
            paymentReportRow({ id: "report-paid", invoiceId: "devtools-seed-v1-invoice-paid" }),
            paymentReportRow({
              id: "report-added-during-testing",
              invoiceId: "invoice-created-during-testing",
            }),
            paymentReportRow({
              id: "report-of-testing-campaign",
              invoiceId: "invoice-of-testing-campaign",
            }),
          ],
          session: [
            sessionRow({ id: "session-seed", userId: "devtools-seed-v1-customer" }),
            sessionRow({ id: "session-survivor", userId: "user-survivor" }),
          ],
        });

        const report = await service.clearSeed();

        expect(report).toEqual({ version: 1, deletedUsers: 3, deletedOrders: 2 });
        expect(db.rows("user").map((row) => row.id)).toEqual(["user-survivor"]);
        expect(db.rows("workOrder").map((row) => row.id)).toEqual(["order-created-during-testing"]);
        expect(db.rows("invoice").map((row) => row.id)).toEqual(["invoice-of-testing-campaign"]);
        expect(db.rows("invoicePaymentReport").map((row) => row.id)).toEqual([
          "report-of-testing-campaign",
        ]);
        expect(db.rows("category").map((row) => row.id)).toEqual(["category-survivor"]);
        expect(db.rows("session").map((row) => row.id)).toEqual(["session-survivor"]);
      },
    );

    it(
      qc(
        "devtools.seed-cleanup.conflict",
        "reports a conflict when seed records are still referenced elsewhere",
      ),
      async () => {
        const { db, service } = devToolsService(
          { user: [userRow()], workOrder: [orderRow()], category: [categoryRow()] },
          { failOn: { table: "workOrder", operation: "deleteMany", code: "P2003" } },
        );

        await expect(service.clearSeed()).rejects.toThrow(ConflictException);

        expect(db.rows("user").map((row) => row.id)).toEqual(["devtools-seed-v1-customer"]);
        expect(db.rows("workOrder").map((row) => row.id)).toEqual([
          "devtools-seed-v1-order-invoiced",
        ]);
        expect(db.rows("category").map((row) => row.id)).toEqual([
          "devtools-seed-v1-category-design",
        ]);
      },
    );
  });

  describe("Reset", () => {
    it(
      qc(
        "devtools.reset.full",
        "wipes every table in dependency order and recreates the administrator from the environment",
      ),
      async () => {
        const { db, service, purge } = devToolsService({
          user: [
            userRow({ id: "user-1" }),
            userRow({ id: "user-2", email: "second@example.test" }),
          ],
          account: [accountRow({ userId: "user-1" })],
          session: [
            sessionRow({ id: "session-1", userId: "user-1" }),
            sessionRow({ id: "session-2", userId: "user-2" }),
          ],
          verification: [{ id: "verification-1", identifier: "user-2", value: "token" }],
          category: [categoryRow()],
          workOrder: [orderRow()],
          invoice: [invoiceRow()],
          invoicePaymentReport: [
            paymentReportRow({ id: "report-1" }),
            paymentReportRow({ id: "report-2" }),
          ],
          invoiceSequence: [{ id: "sequence-1", year: 2026, value: 1 }],
        });

        const report = await withEnv(
          { ADMIN_EMAIL: " Admin@Example.Test ", ADMIN_PASSWORD: "reset-password-123" },
          () => service.reset({ purgeFiles: true }),
        );

        expect(report.deleted).toEqual({
          users: 2,
          sessions: 2,
          verifications: 1,
          categories: 1,
          orders: 1,
          invoices: 1,
          paymentReports: 2,
          invoiceSequences: 1,
        });
        expect(report.files).toEqual({ deleted: 5, failed: 1 });
        expect(purge).toHaveBeenCalledTimes(1);

        const admins = db.rows("user");
        expect(admins).toHaveLength(1);
        expect(admins[0]).toMatchObject({
          email: "admin@example.test",
          role: UserRole.ADMIN,
          emailVerified: true,
          isActive: true,
        });
        expect(report.admin).toEqual({ id: admins[0]?.id, email: "admin@example.test" });

        const credentials = db.rows("account");
        expect(credentials).toHaveLength(1);
        expect(credentials[0]).toMatchObject({
          providerId: "credential",
          userId: admins[0]?.id,
          accountId: admins[0]?.id,
        });
        await expect(
          verifyPassword({ hash: String(credentials[0]?.password), password: "reset-password-123" }),
        ).resolves.toBe(true);

        for (const table of [
          "session",
          "verification",
          "category",
          "workOrder",
          "invoice",
          "invoicePaymentReport",
          "invoiceSequence",
        ] as const) {
          expect(db.rows(table), table).toEqual([]);
        }
      },
    );

    it(
      qc("devtools.reset.keeps-files", "keeps stored files when the purge is not requested"),
      async () => {
        const { db, service, purge } = devToolsService({ user: [userRow()] });

        const report = await withEnv(
          { ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: "reset-password-123" },
          () => service.reset({ purgeFiles: false }),
        );

        expect(purge).not.toHaveBeenCalled();
        expect(report.files).toBeNull();
        expect(db.rows("user")).toHaveLength(1);
        expect(db.rows("user")[0]).toMatchObject({
          email: "admin@example.test",
          role: UserRole.ADMIN,
        });
      },
    );

    it(
      qc(
        "devtools.reset.purge-failure",
        "reports a failed file purge without undoing the reset",
      ),
      async () => {
        const { db, service } = devToolsServiceWithStorage(
          { user: [userRow()] },
          {
            deleteAll: async () => {
              throw new Error("Bucket unreachable");
            },
          },
        );

        const report = await withEnv(
          { ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: "reset-password-123" },
          () => service.reset({ purgeFiles: true }),
        );

        expect(report.files).toEqual({ deleted: 0, failed: 0, error: "Bucket unreachable" });
        expect(db.rows("user")).toHaveLength(1);
        expect(db.rows("user")[0]).toMatchObject({ email: "admin@example.test" });
      },
    );

    it(
      qc(
        "devtools.reset.requires-admin",
        "refuses to reset when the administrator credentials are not configured",
      ),
      async () => {
        const { db, service } = devToolsService({ user: [userRow()], workOrder: [orderRow()] });

        await withEnv({ ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: undefined }, async () => {
          await expect(service.reset({ purgeFiles: true })).rejects.toThrow(BadRequestException);
        });

        expect(db.rows("user").map((row) => row.id)).toEqual(["devtools-seed-v1-customer"]);
        expect(db.rows("workOrder").map((row) => row.id)).toEqual([
          "devtools-seed-v1-order-invoiced",
        ]);
      },
    );
  });

  describe("Users", () => {
    it(
      qc(
        "devtools.users.create-normalizes",
        "creates a test account with a normalized email and revokes its sign-up session",
      ),
      async () => {
        const { db, service } = devToolsService();
        signUpThroughFake(db);

        const created = await service.createUser(
          UserRole.EXECUTOR,
          " New.Executor@Example.Test ",
          "executor-password",
        );

        const stored = db.rows("user")[0];
        expect(created).toEqual({ id: stored?.id });
        expect(stored).toMatchObject({
          email: "new.executor@example.test",
          name: "new.executor",
          role: UserRole.EXECUTOR,
        });
        expect(db.rows("session")).toEqual([]);
      },
    );

    it(
      qc(
        "devtools.users.create-duplicate",
        "refuses a second account for an email that is already in use",
      ),
      async () => {
        const { db, service } = devToolsService({
          user: [userRow({ id: "existing", email: "taken@example.test" })],
        });
        signUpThroughFake(db);

        await expect(
          service.createUser(UserRole.CUSTOMER, " TAKEN@Example.Test ", "customer-password"),
        ).rejects.toThrow(ConflictException);

        expect(signUpEmail).not.toHaveBeenCalled();
        expect(db.rows("user").map((row) => row.id)).toEqual(["existing"]);
      },
    );

    it(
      qc(
        "devtools.users.create-compensates",
        "removes the account again when the role cannot be applied",
      ),
      async () => {
        const { db, service } = devToolsService(
          {},
          { failOn: { table: "user", operation: "update" } },
        );
        signUpThroughFake(db);

        await expect(
          service.createUser(UserRole.EXECUTOR, "new.executor@example.test", "executor-password"),
        ).rejects.toThrow("rejected user.update");

        expect(db.rows("user")).toEqual([]);
        expect(db.rows("account")).toEqual([]);
        expect(db.rows("session")).toEqual([]);
      },
    );

    it(
      qc("devtools.users.list", "lists the accounts of one role in creation order"),
      async () => {
        const { service } = devToolsService({
          user: [
            userRow({
              id: "executor-late",
              role: UserRole.EXECUTOR,
              email: "late@example.test",
              createdAt: new Date("2026-10-02T09:00:00.000Z"),
            }),
            userRow({ id: "customer-1", createdAt: new Date("2026-10-01T09:00:00.000Z") }),
            userRow({
              id: "executor-early",
              role: UserRole.EXECUTOR,
              email: "early@example.test",
              createdAt: new Date("2026-10-01T10:00:00.000Z"),
            }),
            userRow({
              id: "executor-retired",
              role: UserRole.EXECUTOR,
              email: "retired@example.test",
              isActive: false,
              createdAt: new Date("2026-10-03T09:00:00.000Z"),
            }),
          ],
        });

        const listed = await service.listUsers(UserRole.EXECUTOR);

        expect(listed.map((row) => row.id)).toEqual([
          "executor-early",
          "executor-late",
          "executor-retired",
        ]);
        expect(Object.keys(listed[0] ?? {}).sort()).toEqual([
          "createdAt",
          "email",
          "id",
          "isActive",
          "name",
          "role",
        ]);
      },
    );

    it(
      qc(
        "devtools.users.update-email",
        "normalizes a new email, unverifies it and ends the sessions",
      ),
      async () => {
        const { db, service } = devToolsService({
          user: [
            userRow({ id: "user-1", email: "old@example.test", emailVerified: true }),
            userRow({ id: "user-2", email: "other@example.test" }),
          ],
          account: [accountRow({ userId: "user-1" })],
          session: [
            sessionRow({ userId: "user-1" }),
            sessionRow({ id: "session-2", userId: "user-2" }),
          ],
        });

        const updated = await service.updateUser("user-1", { email: " Changed@Example.Test " });

        expect(db.rows("user").find((row) => row.id === "user-1")).toMatchObject({
          email: "changed@example.test",
          emailVerified: false,
          isActive: true,
        });
        expect(db.rows("session").map((row) => row.userId)).toEqual(["user-2"]);
        expect(updated).toMatchObject({
          id: "user-1",
          email: "changed@example.test",
          role: UserRole.CUSTOMER,
        });
      },
    );

    it(
      qc(
        "devtools.users.update-password",
        "replaces the stored password hash and ends the sessions, keeping the email verified",
      ),
      async () => {
        const previousHash = await hashPassword("old-password");
        const { db, service } = devToolsService({
          user: [userRow({ id: "user-1", emailVerified: true })],
          account: [accountRow({ userId: "user-1", password: previousHash })],
          session: [sessionRow({ userId: "user-1" })],
        });

        await service.updateUser("user-1", { password: "new-password-123" });

        const stored = db.rows("account")[0];
        expect(stored?.password).not.toBe(previousHash);
        await expect(
          verifyPassword({ hash: String(stored?.password), password: "new-password-123" }),
        ).resolves.toBe(true);
        await expect(
          verifyPassword({ hash: String(stored?.password), password: "old-password" }),
        ).resolves.toBe(false);
        expect(db.rows("user")[0]).toMatchObject({ emailVerified: true });
        expect(db.rows("session")).toEqual([]);
      },
    );

    it(
      qc(
        "devtools.users.update-without-credential",
        "refuses a password change for an account without a credential provider",
      ),
      async () => {
        const { db, service } = devToolsService({
          user: [userRow({ id: "user-1" })],
          account: [accountRow({ userId: "user-1", providerId: "google", password: null })],
          session: [sessionRow({ userId: "user-1" })],
        });

        await expect(service.updateUser("user-1", { password: "new-password-123" })).rejects.toThrow(
          BadRequestException,
        );

        expect(db.rows("account")[0]).toMatchObject({ providerId: "google", password: null });
        expect(db.rows("session")).toHaveLength(1);
      },
    );

    it(
      qc(
        "devtools.users.update-rejects",
        "refuses an empty patch, an unknown user and an email that is already taken",
      ),
      async () => {
        const { db, service } = devToolsService({
          user: [
            userRow({ id: "user-1", email: "first@example.test" }),
            userRow({ id: "user-2", email: "second@example.test" }),
          ],
        });

        await expect(service.updateUser("user-1", {})).rejects.toThrow(BadRequestException);
        await expect(service.updateUser("user-missing", { isActive: false })).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.updateUser("user-1", { email: "SECOND@example.test" })).rejects.toThrow(
          ConflictException,
        );

        expect(db.rows("user").map((row) => row.email)).toEqual([
          "first@example.test",
          "second@example.test",
        ]);
      },
    );
  });

  describe("Seed import", () => {
    it(
      qc(
        "devtools.seed.imports-fixture",
        "imports the fixture with credential accounts, status history and invoices",
      ),
      async () => {
        const fixture = await readFixture();
        const { db, service } = devToolsService();

        const report = await withEnv({ DEVTOOLS_SEED_PASSWORD: "seed-password-123" }, () =>
          service.seed(),
        );

        expect(report).toEqual({
          version: fixture.version,
          users: fixture.users.map(({ id, email }) => ({ id, email })),
          orders: fixture.orders.length,
        });

        const users = db.rows("user");
        expect(users.map((row) => row.email)).toEqual(fixture.users.map((user) => user.email));
        expect(users.every((row) => row.emailVerified === true)).toBe(true);
        const executor = users.find((row) => row.id === "devtools-seed-v1-executor");
        expect(String(executor?.hourlyRate)).toBe("45");

        const accounts = db.rows("account");
        expect(accounts).toHaveLength(fixture.users.length);
        for (const account of accounts) {
          expect(account.providerId).toBe("credential");
          expect(account.accountId).toBe(account.userId);
          await expect(
            verifyPassword({ hash: String(account.password), password: "seed-password-123" }),
          ).resolves.toBe(true);
        }

        const adminId = fixture.users.find((user) => user.role === UserRole.ADMIN)?.id;
        expect(db.rows("category").map((row) => [row.id, row.createdById])).toEqual(
          fixture.categories.map((category) => [category.id, adminId]),
        );

        const orders = db.rows("workOrder");
        expect(orders.map((row) => [row.id, row.status])).toEqual(
          fixture.orders.map((order) => [order.id, order.status]),
        );
        expect(orders[0]?.createdAt).toBeInstanceOf(Date);

        const history = db.rows("orderStatusHistory");
        expect(history.map((row) => row.toStatus)).toEqual(
          fixture.orders.map((order) => order.status),
        );
        expect(history.every((row) => row.fromStatus === null)).toBe(true);

        const assigned = fixture.orders.filter((order) => order.executorId !== null);
        const assignments = db.rows("orderAssignment");
        expect(assignments.map((row) => row.executorId)).toEqual(
          assigned.map((order) => order.executorId),
        );
        expect(
          assignments.every(
            (row) => row.outcome === AssignmentOutcome.ACTIVE && row.assignedById === adminId,
          ),
        ).toBe(true);

        expect(db.rows("orderComment")).toHaveLength(fixture.comments.length);

        const invoices = db.rows("invoice");
        expect(invoices).toHaveLength(fixture.invoices.length);
        expect(invoices[0]).toMatchObject({
          id: fixture.invoices[0]?.id,
          status: InvoiceStatus.ISSUED,
          paidAt: null,
        });
        expect(String(invoices[0]?.hours)).toBe("1.5");
        expect(String(invoices[0]?.amount)).toBe("67.5");
      },
    );

    it(
      qc(
        "devtools.seed.rejects-email-conflict",
        "refuses to import when a fixture email belongs to another account",
      ),
      async () => {
        const { db, service } = devToolsService({
          user: [userRow({ id: "someone-else", email: "devtools.customer@example.test" })],
        });

        await withEnv({ DEVTOOLS_SEED_PASSWORD: "seed-password-123" }, async () => {
          const failing = service.seed();

          await expect(failing).rejects.toThrow(ConflictException);
          await expect(failing).rejects.toThrow(/devtools\.customer@example\.test/);
        });

        expect(db.rows("user").map((row) => row.id)).toEqual(["someone-else"]);
        expect(db.rows("workOrder")).toEqual([]);
        expect(db.rows("category")).toEqual([]);
      },
    );

    it(
      qc(
        "devtools.seed.requires-password",
        "refuses to seed without a seed password of at least eight characters",
      ),
      async () => {
        const { db, service } = devToolsService();

        await withEnv({ DEVTOOLS_SEED_PASSWORD: undefined }, async () => {
          await expect(service.seed()).rejects.toThrow(BadRequestException);
        });
        await withEnv({ DEVTOOLS_SEED_PASSWORD: "short" }, async () => {
          await expect(service.seed()).rejects.toThrow(BadRequestException);
        });

        expect(db.rows("user")).toEqual([]);
      },
    );

    it(
      qc(
        "devtools.seed.replaces-previous",
        "re-seeds over its own rows instead of failing on them",
      ),
      async () => {
        const fixture = await readFixture();
        const { db, service } = devToolsService();

        await withEnv({ DEVTOOLS_SEED_PASSWORD: "seed-password-123" }, async () => {
          await service.seed();
          const second = await service.seed();

          expect(second.orders).toBe(fixture.orders.length);
        });

        expect(db.rows("user")).toHaveLength(fixture.users.length);
        expect(db.rows("account")).toHaveLength(fixture.users.length);
        expect(db.rows("workOrder")).toHaveLength(fixture.orders.length);
        expect(db.rows("orderStatusHistory")).toHaveLength(fixture.orders.length);
        expect(db.rows("invoice")).toHaveLength(fixture.invoices.length);
      },
    );
  });
});

const adminEmail = "devtools.admin@example.test";
const executorEmail = "devtools.executor@example.test";

type Fixture = {
  version: number;
  users: Array<{ id: string; name: string; email: string; role: UserRole; hourlyRate?: number }>;
  categories: Array<{ id: string; name: string }>;
  orders: Array<{ id: string; status: OrderStatus; customerId: string; executorId: string | null }>;
  comments: Array<{ id: string; orderId: string }>;
  invoices: Array<{ id: string; orderId: string; number: string; hours: number; amount: number }>;
};

/** The fixture the seed imports, read the same way the service reads it. */
async function readFixture(): Promise<Fixture> {
  const content = await readFile(new URL("./fixtures/test-data.json", import.meta.url), "utf8");

  return JSON.parse(content) as Fixture;
}

function devToolsService(
  seed: Parameters<typeof createFakeDatabase>[0] = {},
  options?: Parameters<typeof createFakeDatabase>[1],
) {
  const db = createFakeDatabase(seed, options);
  const purge = vi.fn(async () => ({ deleted: 5, failed: 1 }));

  return {
    db,
    purge,
    service: new DevToolsService(
      db.prisma as unknown as PrismaService,
      { deleteAll: purge } as unknown as ObjectStorageService,
    ),
  };
}

function devToolsServiceWithStorage(
  seed: Parameters<typeof createFakeDatabase>[0],
  storage: { deleteAll: () => Promise<{ deleted: number; failed: number }> },
) {
  const db = createFakeDatabase(seed);

  return {
    db,
    service: new DevToolsService(
      db.prisma as unknown as PrismaService,
      storage as unknown as ObjectStorageService,
    ),
  };
}

/** The rows Better Auth writes for a sign-up: the account and the session it opens. */
function signUpThroughFake(db: FakeDatabase): void {
  const prisma = db.prisma as unknown as {
    user: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
    account: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
    session: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  };

  signUpEmail.mockImplementation(async (...args: unknown[]) => {
    const { body } = args[0] as { body: { name: string; email: string; password: string } };
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, role: UserRole.CUSTOMER },
    });
    await prisma.account.create({
      data: {
        accountId: user.id,
        userId: user.id,
        providerId: "credential",
        password: await hashPassword(body.password),
      },
    });
    await prisma.session.create({ data: { userId: user.id } });

    return { user: { id: user.id } };
  });
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "devtools-seed-v1-customer",
    name: "Seed Customer",
    email: "devtools.customer@example.test",
    emailVerified: true,
    role: UserRole.CUSTOMER,
    isActive: true,
    hourlyRate: null,
    createdAt: new Date("2026-10-20T09:00:00.000Z"),
    ...overrides,
  };
}

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-1",
    userId: "devtools-seed-v1-customer",
    accountId: "devtools-seed-v1-customer",
    providerId: "credential",
    password: "stored-hash",
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return { id: "session-1", userId: "devtools-seed-v1-customer", ...overrides };
}

function categoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "devtools-seed-v1-category-design",
    name: "Seed: Design",
    createdById: "devtools-seed-v1-admin",
    ...overrides,
  };
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "devtools-seed-v1-order-invoiced",
    title: "Seed: invoiced order",
    customerId: "devtools-seed-v1-customer",
    executorId: "devtools-seed-v1-executor",
    categoryId: "devtools-seed-v1-category-design",
    status: OrderStatus.INVOICE_ISSUED,
    ...overrides,
  };
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "devtools-seed-v1-invoice-issued",
    orderId: "devtools-seed-v1-order-invoiced",
    number: "DEV-SEED-2026-0001",
    status: InvoiceStatus.ISSUED,
    ...overrides,
  };
}

function paymentReportRow(overrides: Record<string, unknown> = {}) {
  return { id: "report-1", invoiceId: "devtools-seed-v1-invoice-issued", ...overrides };
}
