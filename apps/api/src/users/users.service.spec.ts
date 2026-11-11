import { hashPassword, verifyPassword } from "better-auth/crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { OrderStatus, UserRole } from "../generated/prisma/enums.js";
import { createFakeDatabase, type FakeDatabase } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
import { UsersService } from "./users.service.js";

/**
 * Signing up belongs to Better Auth, so its call is the boundary this suite
 * replaces; the account it would create is written through the fake database,
 * which lets a case assert what the API left behind.
 */
const signUpEmail = vi.hoisted(() => vi.fn());

vi.mock("../auth/auth.js", () => ({ auth: { api: { signUpEmail } } }));

const currentPassword = "current-password";

describe("Users", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
  });

  describe("Profile", () => {
    it(
      qc(
        "users.profile.update-normalizes",
        "stores a trimmed name and marks a changed email unverified",
      ),
      async () => {
        const { db, service } = await signedInCustomer();

        const profile = await service.updateOwnProfile("user-1", {
          currentPassword,
          name: "  New Name  ",
          email: "NEW@example.test",
        });

        expect(db.rows("user")[0]).toMatchObject({
          name: "New Name",
          email: "new@example.test",
          emailVerified: false,
        });
        expect(profile).toEqual({
          id: "user-1",
          name: "New Name",
          email: "new@example.test",
          emailVerified: false,
          role: UserRole.CUSTOMER,
        });
      },
    );

    it(
      qc(
        "users.profile.wrong-password",
        "leaves the profile untouched when the current password is wrong",
      ),
      async () => {
        const { db, service } = await signedInCustomer();

        await expect(
          service.updateOwnProfile("user-1", {
            currentPassword: "wrong-password",
            name: "New Name",
          }),
        ).rejects.toThrow(BadRequestException);

        expect(db.rows("user")[0]).toMatchObject({
          name: "Old Name",
          email: "old@example.test",
          emailVerified: true,
        });
      },
    );
  });

  describe("Executor rates", () => {
    it(
      qc(
        "users.executor-rates.self-service",
        "stores the hourly rate an executor sets for themselves",
      ),
      async () => {
        const { db, service } = serviceWith({ user: [customer(), executor(), inactiveExecutor()] });

        const profile = await service.updateOwnHourlyRate("executor-1", 45.5);

        const stored = db.rows("user").find((row) => row.id === "executor-1");
        expect(stored?.hourlyRate).toBeInstanceOf(Prisma.Decimal);
        expect(String(stored?.hourlyRate)).toBe("45.5");
        expect(profile.hourlyRate?.toFixed(2)).toBe("45.50");
        expect(profile).toMatchObject({ id: "executor-1", role: UserRole.EXECUTOR });
      },
    );

    it(
      qc(
        "users.executor-rates.inactive-rejected",
        "refuses a rate update for anyone who is not an active executor",
      ),
      async () => {
        const { db, service } = serviceWith({ user: [customer(), executor(), inactiveExecutor()] });

        for (const id of ["customer-1", "executor-2", "executor-missing"]) {
          await expect(service.updateOwnHourlyRate(id, 99)).rejects.toThrow(NotFoundException);
        }

        expect(db.rows("user").map((row) => row.hourlyRate)).toEqual([null, null, null]);
      },
    );

    it(
      qc(
        "users.executor-rates.active-only-list",
        "offers customers only the active executors, without rates or emails",
      ),
      async () => {
        const { service } = serviceWith({
          user: [
            customer(),
            executor({ id: "executor-1", name: "Zoe" }),
            executor({ id: "executor-2", name: "Adam" }),
            inactiveExecutor({ id: "executor-3", name: "Mary" }),
          ],
        });

        await expect(service.listAvailableExecutors()).resolves.toEqual([
          { id: "executor-2", name: "Adam" },
          { id: "executor-1", name: "Zoe" },
        ]);
      },
    );
  });

  describe("Accounts", () => {
    it(
      qc(
        "users.accounts.deactivate-guard",
        "keeps an executor active while unfinished orders remain",
      ),
      async () => {
        const { db, service } = serviceWith({
          user: [executor()],
          session: [{ id: "session-1", userId: "executor-1" }],
          workOrder: [{ id: "order-1", executorId: "executor-1", status: OrderStatus.IN_PROGRESS }],
        });

        await expect(service.setActive("executor-1", false)).rejects.toThrow(ConflictException);

        expect(db.rows("user")[0]).toMatchObject({ isActive: true });
        expect(db.rows("user")[0]).not.toHaveProperty("updatedAt");
        expect(db.rows("session")).toHaveLength(1);
      },
    );

    it(
      qc("users.accounts.deactivate", "ends every session of a deactivated account"),
      async () => {
        const { db, service } = serviceWith({
          user: [customer(), executor()],
          session: [
            { id: "session-1", userId: "customer-1" },
            { id: "session-2", userId: "customer-1" },
            { id: "session-3", userId: "executor-1" },
          ],
          workOrder: [{ id: "order-1", customerId: "customer-1", status: OrderStatus.IN_PROGRESS }],
        });

        const account = await service.setActive("customer-1", false);

        expect(account).toEqual({
          id: "customer-1",
          name: "Old Name",
          email: "old@example.test",
          role: UserRole.CUSTOMER,
          isActive: false,
        });
        expect(db.rows("session").map((row) => row.userId)).toEqual(["executor-1"]);
        expect(db.rows("workOrder")).toHaveLength(1);
      },
    );

    it(
      qc(
        "users.accounts.password-reset",
        "replaces the stored password hash and ends the sessions of the account",
      ),
      async () => {
        const previousHash = await hashPassword("old-password");
        const { db, service } = serviceWith({
          user: [executor()],
          account: [
            {
              id: "account-1",
              userId: "executor-1",
              providerId: "credential",
              password: previousHash,
            },
          ],
          session: [
            { id: "session-1", userId: "executor-1" },
            { id: "session-2", userId: "executor-1" },
          ],
        });

        await expect(service.resetPassword("executor-1", "new-password")).resolves.toEqual({
          success: true,
        });

        const stored = db.rows("account")[0]?.password as string;
        expect(stored).not.toBe(previousHash);
        await expect(verifyPassword({ hash: stored, password: "new-password" })).resolves.toBe(true);
        await expect(verifyPassword({ hash: stored, password: "old-password" })).resolves.toBe(
          false,
        );
        expect(db.rows("session")).toHaveLength(0);
      },
    );

    it(
      qc(
        "users.accounts.reset-scope",
        "refuses a password reset for an administrator or an account without a password",
      ),
      async () => {
        const { db, service } = serviceWith({ user: [administrator(), executor()] });

        await expect(service.resetPassword("admin-1", "new-password")).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.resetPassword("executor-1", "new-password")).rejects.toThrow(
          BadRequestException,
        );
        expect(db.rows("account")).toHaveLength(0);
      },
    );
  });

  describe("Executors and customers", () => {
    it(
      qc(
        "users.executors.create",
        "creates an active executor and drops the session its sign-up opened",
      ),
      async () => {
        const { db, service } = serviceWith({});
        signUpThroughFake(db);

        const created = await service.createExecutor({
          name: "  New Executor  ",
          email: "EXECUTOR@example.test",
          password: "secret-password",
        });

        expect(created).toMatchObject({
          name: "New Executor",
          email: "executor@example.test",
          role: UserRole.EXECUTOR,
          isActive: true,
        });
        expect(db.rows("user")).toHaveLength(1);
        expect(db.rows("session")).toHaveLength(0);
        expect(signUpEmail).toHaveBeenCalledWith({
          body: {
            name: "New Executor",
            email: "executor@example.test",
            password: "secret-password",
          },
        });
      },
    );

    it(
      qc(
        "users.executors.create-duplicate",
        "refuses a second executor for an email that already has an account",
      ),
      async () => {
        const { db, service } = serviceWith({ user: [customer()] });
        signUpThroughFake(db);

        await expect(
          service.createExecutor({
            name: "Second Account",
            email: "OLD@example.test",
            password: "secret-password",
          }),
        ).rejects.toThrow(ConflictException);

        expect(signUpEmail).not.toHaveBeenCalled();
        expect(db.rows("user")).toHaveLength(1);
      },
    );

    it(
      qc(
        "users.executors.create-rollback",
        "removes the half-created account when the executor role cannot be stored",
      ),
      async () => {
        const db = createFakeDatabase({}, { failOn: { table: "user", operation: "update" } });
        signUpThroughFake(db);
        const service = new UsersService(db.prisma as unknown as PrismaService);

        await expect(
          service.createExecutor({
            name: "New Executor",
            email: "executor@example.test",
            password: "secret-password",
          }),
        ).rejects.toThrow("The fake database rejected user.update");

        expect(db.rows("user")).toHaveLength(0);
      },
    );

    it(
      qc("users.executors.update", "renames an executor and reports anyone else as not found"),
      async () => {
        const { db, service } = serviceWith({ user: [executor(), customer()] });

        const renamed = await service.updateExecutor("executor-1", { name: "  Renamed  " });

        expect(renamed).toMatchObject({ name: "Renamed" });
        expect(db.rows("user")[0]).toMatchObject({ name: "Renamed" });
        await expect(service.updateExecutor("customer-1", { name: "Renamed" })).rejects.toThrow(
          NotFoundException,
        );
        await expect(service.updateExecutor("user-missing", { name: "Renamed" })).rejects.toThrow(
          NotFoundException,
        );
      },
    );

    it(qc("users.customers.list", "lists customers separately from executors"), async () => {
      const { service } = serviceWith({
        user: [
          customer({ id: "customer-2", name: "Ann" }),
          customer({ id: "customer-1", name: "Bob", isActive: false }),
          executor(),
        ],
      });

      await expect(service.listCustomers(false)).resolves.toMatchObject([{ id: "customer-2" }]);
      await expect(service.listCustomers(true)).resolves.toMatchObject([
        { id: "customer-2" },
        { id: "customer-1", isActive: false },
      ]);
      const listed = await service.listCustomers(true);
      expect(listed[0]).not.toHaveProperty("hourlyRate");
    });
  });
});

function serviceWith(
  seed: Parameters<typeof createFakeDatabase>[0],
  options?: Parameters<typeof createFakeDatabase>[1],
) {
  const db = createFakeDatabase(seed, options);

  return { db, service: new UsersService(db.prisma as unknown as PrismaService) };
}

/** The signed-in customer of the profile cases, with a hash its password verifies against. */
async function signedInCustomer() {
  const password = await hashPassword(currentPassword);

  return serviceWith({
    user: [customer({ id: "user-1", name: "Old Name", email: "old@example.test", emailVerified: true })],
    account: [{ id: "account-1", userId: "user-1", providerId: "credential", password }],
  });
}

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: "customer-1",
    name: "Old Name",
    email: "old@example.test",
    emailVerified: true,
    role: UserRole.CUSTOMER,
    isActive: true,
    hourlyRate: null,
    ...overrides,
  };
}

function executor(overrides: Record<string, unknown> = {}) {
  return customer({
    id: "executor-1",
    name: "Executor",
    email: "executor@example.test",
    role: UserRole.EXECUTOR,
    ...overrides,
  });
}

function inactiveExecutor(overrides: Record<string, unknown> = {}) {
  return executor({ id: "executor-2", email: "retired@example.test", isActive: false, ...overrides });
}

function administrator(overrides: Record<string, unknown> = {}) {
  return customer({
    id: "admin-1",
    name: "Administrator",
    email: "admin@example.test",
    role: UserRole.ADMIN,
    ...overrides,
  });
}

/** The rows Better Auth writes for a sign-up: the account and the session it opens. */
function signUpThroughFake(db: FakeDatabase) {
  const prisma = db.prisma as unknown as {
    user: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
    session: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  };

  signUpEmail.mockImplementation(async (...args: unknown[]) => {
    const { body } = args[0] as { body: { name: string; email: string } };
    const created = await prisma.user.create({
      data: { name: body.name, email: body.email, role: UserRole.CUSTOMER },
    });
    await prisma.session.create({ data: { userId: created.id } });
    return { user: { id: created.id } };
  });
}
