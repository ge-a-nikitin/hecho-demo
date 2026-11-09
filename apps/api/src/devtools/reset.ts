import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { UserRole } from "../generated/prisma/enums.js";

export type AdminCredentials = {
  email: string;
  password: string;
};

/** The subset of the object storage used by a reset; keeps the module testable. */
export type StoragePurge = {
  deleteAll(): Promise<{ deleted: number; failed: number }>;
};

export type ResetReport = {
  admin: { id: string; email: string };
  deleted: {
    users: number;
    sessions: number;
    verifications: number;
    categories: number;
    orders: number;
    invoices: number;
    paymentReports: number;
    invoiceSequences: number;
  };
  /** Null when the caller kept files; otherwise the bucket purge outcome. */
  files: null | { deleted: number; failed: number; error?: string };
};

const administratorName = "Администратор";

/** Administrator credentials from the environment, read before any data is destroyed. */
export function readAdminCredentials(env: NodeJS.ProcessEnv = process.env): AdminCredentials {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to recreate the administrator");
  }
  return { email, password };
}

/**
 * Deletes every business record and recreates the single administrator from the
 * environment in one transaction, so a failed administrator insert leaves the
 * previous data untouched. File objects are purged only after the commit:
 * the database stays the source of truth if the bucket cannot be reached.
 */
export async function resetAllData(
  prisma: PrismaClient,
  options: { admin: AdminCredentials; storage?: StoragePurge },
): Promise<ResetReport> {
  const passwordHash = await hashPassword(options.admin.password);

  const { admin, deleted } = await prisma.$transaction(async (tx) => {
    const wiped = await wipeData(tx);
    const created = await createAdministrator(tx, options.admin.email, passwordHash);
    return { admin: created, deleted: wiped };
  });

  let files: ResetReport["files"] = null;
  if (options.storage) {
    try {
      files = await options.storage.deleteAll();
    } catch (error) {
      files = {
        deleted: 0,
        failed: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { admin, deleted, files };
}

/**
 * Deletion order follows the foreign keys: invoices and payment reports point at
 * orders with RESTRICT, orders cascade into comments, estimates, assignments,
 * attachments, status history and time entries, and categories precede users.
 */
async function wipeData(tx: Prisma.TransactionClient): Promise<ResetReport["deleted"]> {
  const paymentReports = await tx.invoicePaymentReport.deleteMany();
  const invoices = await tx.invoice.deleteMany();
  const orders = await tx.workOrder.deleteMany();
  const categories = await tx.category.deleteMany();
  const sessions = await tx.session.deleteMany();
  const verifications = await tx.verification.deleteMany();
  const users = await tx.user.deleteMany();
  const invoiceSequences = await tx.invoiceSequence.deleteMany();

  return {
    users: users.count,
    sessions: sessions.count,
    verifications: verifications.count,
    categories: categories.count,
    orders: orders.count,
    invoices: invoices.count,
    paymentReports: paymentReports.count,
    invoiceSequences: invoiceSequences.count,
  };
}

async function createAdministrator(
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
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    },
  });

  return user;
}
