import { hashPassword, verifyPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { UserRole } from "../generated/prisma/enums.js";
import { createFakeDatabase } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
import { readAdminCredentials, syncAdministrator } from "./admin-account.js";

describe("Auth", () => {
  describe("Administrator provisioning", () => {
    it(
      qc(
        "auth.admin-account.creates-missing-administrator",
        "creates the administrator with a credential account when none exists",
      ),
      async () => {
        const db = createFakeDatabase();

        const outcome = await sync({ db, credentials: admin });

        expect(outcome.action).toBe("created");
        const [administrator] = db.rows("user");
        expect(administrator.email).toBe(admin.email);
        expect(administrator.role).toBe(UserRole.ADMIN);
        expect(administrator.isActive).toBe(true);
        expect(administrator.emailVerified).toBe(true);
        const [account] = db.rows("account");
        expect(account.userId).toBe(administrator.id);
        expect(account.providerId).toBe("credential");
        expect(
          await verifyPassword({ hash: String(account.password), password: admin.password }),
        ).toBe(true);
      },
    );

    it(
      qc(
        "auth.admin-account.renames-the-single-administrator",
        "moves a new ADMIN_EMAIL onto the existing administrator and keeps its id",
      ),
      async () => {
        const db = createFakeDatabase({
          user: [
            userRow({ id: "admin-1", email: "old@example.test", role: UserRole.ADMIN }),
            userRow({ id: "customer-1", email: "customer@example.test", role: UserRole.CUSTOMER }),
          ],
          account: [accountRow({ userId: "admin-1", password: await hashPassword(admin.password) })],
          session: [
            sessionRow({ id: "session-admin", userId: "admin-1" }),
            sessionRow({ id: "session-customer", userId: "customer-1" }),
          ],
        });
        const moved = { email: "moved@example.test", password: "another-admin-password" };

        const outcome = await sync({ db, credentials: moved });

        expect(outcome).toMatchObject({ action: "updated", renamedFrom: "old@example.test" });
        const users = db.rows("user");
        expect(users.map((user) => user.id)).toEqual(["admin-1", "customer-1"]);
        expect(users[0].email).toBe(moved.email);
        expect(db.rows("session").map((session) => session.id)).toEqual(["session-customer"]);
        const [account] = db.rows("account");
        expect(
          await verifyPassword({ hash: String(account.password), password: moved.password }),
        ).toBe(true);
      },
    );

    it(
      qc(
        "auth.admin-account.leaves-a-matching-administrator-alone",
        "writes nothing when the stored password already matches ADMIN_PASSWORD",
      ),
      async () => {
        const storedHash = await hashPassword(admin.password);
        const db = createFakeDatabase({
          user: [userRow({ id: "admin-1", email: admin.email, role: UserRole.ADMIN })],
          account: [accountRow({ userId: "admin-1", password: storedHash })],
          session: [sessionRow({ id: "session-admin", userId: "admin-1" })],
        });

        const outcome = await sync({ db, credentials: admin });

        expect(outcome.action).toBe("unchanged");
        const [account] = db.rows("account");
        expect(account.password).toBe(storedHash);
        expect(db.rows("session").map((session) => session.id)).toEqual(["session-admin"]);
      },
    );

    it(
      qc(
        "auth.admin-account.replaces-a-stale-password",
        "rewrites the password of a disabled administrator and revokes its sessions",
      ),
      async () => {
        const db = createFakeDatabase({
          user: [
            userRow({
              id: "admin-1",
              email: admin.email,
              role: UserRole.ADMIN,
              isActive: false,
              emailVerified: false,
            }),
            userRow({ id: "customer-1", email: "customer@example.test", role: UserRole.CUSTOMER }),
          ],
          account: [
            accountRow({ userId: "admin-1", password: await hashPassword("stale-password") }),
          ],
          session: [
            sessionRow({ id: "session-admin", userId: "admin-1" }),
            sessionRow({ id: "session-customer", userId: "customer-1" }),
          ],
        });

        const outcome = await sync({ db, credentials: admin });

        expect(outcome).toMatchObject({
          action: "updated",
          renamedFrom: null,
          passwordChanged: true,
        });
        const [administrator] = db.rows("user");
        expect(administrator.isActive).toBe(true);
        expect(administrator.emailVerified).toBe(true);
        const [account] = db.rows("account");
        expect(
          await verifyPassword({ hash: String(account.password), password: admin.password }),
        ).toBe(true);
        expect(db.rows("session").map((session) => session.id)).toEqual(["session-customer"]);
      },
    );

    it(
      qc(
        "auth.admin-account.attaches-a-credential-account",
        "adds the credential account a password-less administrator is missing",
      ),
      async () => {
        const db = createFakeDatabase({
          user: [userRow({ id: "admin-1", email: admin.email, role: UserRole.ADMIN })],
          session: [sessionRow({ id: "session-admin", userId: "admin-1" })],
        });

        const outcome = await sync({ db, credentials: admin });

        expect(outcome).toMatchObject({ action: "updated", passwordChanged: true });
        const [account] = db.rows("account");
        expect(account.userId).toBe("admin-1");
        expect(account.providerId).toBe("credential");
        expect(
          await verifyPassword({ hash: String(account.password), password: admin.password }),
        ).toBe(true);
        expect(db.rows("session")).toEqual([]);
      },
    );

    it(
      qc(
        "auth.admin-account.refuses-a-taken-email",
        "stops instead of promoting an account that already owns ADMIN_EMAIL",
      ),
      async () => {
        const db = createFakeDatabase({
          user: [userRow({ id: "customer-1", email: admin.email, role: UserRole.CUSTOMER })],
        });

        await expect(sync({ db, credentials: admin })).rejects.toThrow(
          `The account ${admin.email} already exists and is not an administrator`,
        );
        const users = db.rows("user");
        expect(users).toHaveLength(1);
        expect(users[0].role).toBe(UserRole.CUSTOMER);
        expect(db.rows("account")).toEqual([]);
      },
    );

    it(
      qc(
        "auth.admin-account.refuses-ambiguous-administrators",
        "names the competing administrators instead of renaming one of them",
      ),
      async () => {
        const db = createFakeDatabase({
          user: [
            userRow({ id: "admin-1", email: "first@example.test", role: UserRole.ADMIN }),
            userRow({ id: "admin-2", email: "second@example.test", role: UserRole.ADMIN }),
          ],
        });

        await expect(sync({ db, credentials: admin })).rejects.toThrow(
          "first@example.test, second@example.test",
        );
        expect(db.rows("user").map((user) => user.email)).toEqual([
          "first@example.test",
          "second@example.test",
        ]);
      },
    );
  });

  describe("Administrator credentials", () => {
    it(
      qc(
        "auth.admin-credentials.normalises-the-email",
        "lower-cases and trims ADMIN_EMAIL before it reaches the database",
      ),
      () => {
        const credentials = readAdminCredentials({
          ADMIN_EMAIL: "  Admin@Example.Test ",
          ADMIN_PASSWORD: "deployment-admin-password",
        });

        expect(credentials.email).toBe("admin@example.test");
      },
    );

    it(
      qc(
        "auth.admin-credentials.refuses-a-short-password",
        "rejects ADMIN_PASSWORD below the length Better Auth accepts",
      ),
      () => {
        expect(() =>
          readAdminCredentials({ ADMIN_EMAIL: admin.email, ADMIN_PASSWORD: "short" }),
        ).toThrow("ADMIN_PASSWORD must be at least 8 characters");
      },
    );
  });
});

const admin = { email: "admin@example.test", password: "deployment-admin-password" };

async function sync({
  db,
  credentials,
}: {
  db: ReturnType<typeof createFakeDatabase>;
  credentials: { email: string; password: string };
}) {
  return syncAdministrator(db.prisma as unknown as PrismaClient, credentials);
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Seed User",
    email: "user@example.test",
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
    userId: "admin-1",
    accountId: "admin-1",
    providerId: "credential",
    password: "stored-hash",
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return { id: "session-1", userId: "admin-1", ...overrides };
}
