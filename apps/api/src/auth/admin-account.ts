/**
 * The administrator named by `ADMIN_EMAIL` and `ADMIN_PASSWORD` is the only
 * account the demo cannot work without, and the environment is its source of
 * truth: every deployment runs `syncAdministrator`, so a changed secret reaches
 * the database without anyone touching the host.
 */

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { UserRole } from "../generated/prisma/enums.js";

export type AdminCredentials = {
  email: string;
  password: string;
};

/** Better Auth refuses a shorter password, so the check runs before any write. */
export const minimumAdminPasswordLength = 8;

const administratorName = "Администратор";
const credentialProviderId = "credential";

/** The slice of the Prisma client the provisioning needs; keeps the module testable. */
type AdminAccountClient = Pick<PrismaClient, "user" | "account" | "session" | "$transaction">;

export type AdminSyncOutcome =
  | { action: "created"; userId: string; email: string }
  | {
      action: "updated";
      userId: string;
      email: string;
      /** The email the administrator held before the rename, or null when it did not move. */
      renamedFrom: string | null;
      passwordChanged: boolean;
      revokedSessions: number;
    }
  | { action: "unchanged"; userId: string; email: string };

/** Administrator credentials from the environment, read before any data is written. */
export function readAdminCredentials(env: NodeJS.ProcessEnv = process.env): AdminCredentials {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to recreate the administrator");
  }
  if (password.length < minimumAdminPasswordLength) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${minimumAdminPasswordLength} characters, ` +
        "because Better Auth refuses to store a shorter one",
    );
  }
  return { email, password };
}

/**
 * Creates the administrator with the credential account Better Auth reads the
 * password from. Callers pass their transaction, so a reset keeps it in the same
 * atomic step.
 */
export async function createAdministrator(
  tx: Prisma.TransactionClient,
  email: string,
  passwordHash: string,
): Promise<{ id: string; email: string }> {
  const user = await tx.user.create({
    data: {
      name: administratorName,
      email,
      role: UserRole.ADMIN,
      emailVerified: true,
      isActive: true,
    },
    select: { id: true, email: true },
  });

  await tx.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: credentialProviderId,
      userId: user.id,
      password: passwordHash,
    },
  });

  return user;
}

/**
 * Makes the administrator match the environment: it creates the account when the
 * database has none, otherwise it moves the new email onto the existing row and
 * replaces the password. The row is renamed rather than recreated because orders,
 * categories, invoices and status history reference the user with `RESTRICT`,
 * and its history would otherwise be lost.
 *
 * Nothing is written when the stored hash already answers to `ADMIN_PASSWORD`, so
 * a deployment that changed nothing does not sign the administrator out. A real
 * change revokes that user's sessions and nobody else's.
 */
export async function syncAdministrator(
  prisma: AdminAccountClient,
  credentials: AdminCredentials,
): Promise<AdminSyncOutcome> {
  const passwordHash = await hashPassword(credentials.password);

  const holder = await prisma.user.findUnique({
    where: { email: credentials.email },
    select: { id: true, email: true, role: true, isActive: true, emailVerified: true },
  });

  if (holder) {
    if (holder.role !== UserRole.ADMIN) {
      throw new Error(
        `The account ${credentials.email} already exists and is not an administrator`,
      );
    }

    return reconcile(prisma, { administrator: holder, renamedFrom: null, credentials });
  }

  const administrators = await prisma.user.findMany({
    where: { role: UserRole.ADMIN },
    select: { id: true, email: true, isActive: true, emailVerified: true },
  });

  if (administrators.length === 0) {
    const created = await prisma.$transaction((tx) =>
      createAdministrator(tx, credentials.email, passwordHash),
    );
    return { action: "created", userId: created.id, email: created.email };
  }

  if (administrators.length > 1) {
    const emails = administrators.map((candidate) => candidate.email).join(", ");
    throw new Error(
      `ADMIN_EMAIL ${credentials.email} matches no administrator and the database holds ` +
        `${administrators.length} of them (${emails}); point ADMIN_EMAIL at one of them`,
    );
  }

  const [only] = administrators;
  if (!only) {
    throw new Error(`ADMIN_EMAIL ${credentials.email} matches no administrator`);
  }

  return reconcile(prisma, { administrator: only, renamedFrom: only.email, credentials });
}

/** The user columns the reconciliation reads and repairs. */
type AdministratorRow = {
  id: string;
  email: string;
  isActive: boolean;
  emailVerified: boolean;
};

/**
 * Writes the environment onto a row that already exists: the email, the password
 * hash and the flags that decide whether the account can sign in at all.
 */
async function reconcile(
  prisma: AdminAccountClient,
  {
    administrator,
    renamedFrom,
    credentials,
  }: {
    administrator: AdministratorRow;
    renamedFrom: string | null;
    credentials: AdminCredentials;
  },
): Promise<AdminSyncOutcome> {
  const passwordHash = await hashPassword(credentials.password);
  const account = await prisma.account.findFirst({
    where: { userId: administrator.id, providerId: credentialProviderId },
    select: { id: true, password: true },
  });

  const passwordChanged = !(await answersTo(account?.password, credentials.password));
  const reactivated = administrator.isActive !== true || administrator.emailVerified !== true;

  if (!passwordChanged && !reactivated && renamedFrom === null) {
    return { action: "unchanged", userId: administrator.id, email: administrator.email };
  }

  const revokedSessions = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: administrator.id },
      data: {
        email: credentials.email,
        role: UserRole.ADMIN,
        isActive: true,
        emailVerified: true,
      },
    });

    if (!account) {
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: administrator.id,
          providerId: credentialProviderId,
          userId: administrator.id,
          password: passwordHash,
        },
      });
    } else if (passwordChanged) {
      await tx.account.update({ where: { id: account.id }, data: { password: passwordHash } });
    }

    if (renamedFrom === null && !passwordChanged) return 0;

    const sessions = await tx.session.deleteMany({ where: { userId: administrator.id } });
    return sessions.count;
  });

  return {
    action: "updated",
    userId: administrator.id,
    email: credentials.email,
    renamedFrom,
    passwordChanged,
    revokedSessions,
  };
}

/** A hash Better Auth cannot parse is not a match, and the deploy replaces it. */
async function answersTo(storedHash: string | null | undefined, password: string): Promise<boolean> {
  if (!storedHash) return false;

  try {
    return await verifyPassword({ hash: storedHash, password });
  } catch {
    return false;
  }
}
