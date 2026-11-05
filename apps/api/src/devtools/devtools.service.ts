import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { AssignmentOutcome, InvoiceStatus, OrderStatus, UserRole } from "../generated/prisma/enums.js";
import { auth } from "../auth/auth.js";
import { PrismaService } from "../database/prisma.service.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type DevToolUserUpdate = {
  email?: string;
  password?: string;
  isActive?: boolean;
};

type SeedFixture = {
  version: number;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    hourlyRate?: number;
  }>;
  categories: Array<{ id: string; name: string }>;
  orders: Array<{
    id: string;
    title: string;
    description: string;
    status: OrderStatus;
    customerId: string;
    executorId: string | null;
    categoryId: string;
    createdAt: string;
    dueAt?: string;
    submittedAt?: string;
    acceptedAt?: string;
    completedAt?: string;
    approvedHours?: number;
    approvedHourlyRate?: number;
    approvedAmount?: number;
  }>;
  comments: Array<{
    id: string;
    orderId: string;
    authorId: string;
    content: string;
    createdAt: string;
  }>;
  invoices: Array<{
    id: string;
    orderId: string;
    issuedById: string;
    number: string;
    status: InvoiceStatus;
    customerName: string;
    executorName: string;
    hours: number;
    hourlyRate: number;
    amount: number;
    issuedAt: string;
    paidAt?: string;
  }>;
};

const fixtureUrl = new URL("./fixtures/test-data.json", import.meta.url);
const retiredFixtureOrderIds = ["devtools-seed-v1-order-completed"];
const retiredFixtureInvoiceIds = ["devtools-seed-v1-invoice-paid"];

@Injectable()
export class DevToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(role: UserRole, inputEmail: string, password: string): Promise<{ id: string }> {
    const email = inputEmail.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("An account with this email already exists");

    let userId: string | undefined;
    try {
      const result = await auth.api.signUpEmail({
        body: {
          name: email.slice(0, email.indexOf("@")),
          email,
          password,
        },
      });
      userId = result.user.id;

      if (role !== UserRole.CUSTOMER) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { role },
        });
      }
      await this.prisma.session.deleteMany({ where: { userId } });
      return { id: userId };
    } catch (error) {
      if (userId) {
        await this.prisma.user.delete({ where: { id: userId } });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An account with this email already exists");
      }
      throw error;
    }
  }

  listUsers(role: UserRole) {
    return this.prisma.user.findMany({
      where: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateUser(id: string, input: DevToolUserUpdate) {
    if (input.email === undefined && input.password === undefined && input.isActive === undefined) {
      throw new BadRequestException("Provide at least one field to update");
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const email = input.email?.trim().toLowerCase();
    const passwordAccount = input.password
      ? await this.prisma.account.findFirst({
          where: { userId: id, providerId: "credential" },
          select: { id: true },
        })
      : null;
    if (input.password && !passwordAccount) {
      throw new BadRequestException("User has no credential account");
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const account = await tx.user.update({
          where: { id },
          data: {
            email,
            emailVerified: email === undefined ? undefined : false,
            isActive: input.isActive,
          },
          select: { id: true, name: true, email: true, role: true, isActive: true },
        });

        if (input.password && passwordAccount) {
          await tx.account.update({
            where: { id: passwordAccount.id },
            data: { password: await hashPassword(input.password) },
          });
        }

        if (email !== undefined || input.password !== undefined || input.isActive === false) {
          await tx.session.deleteMany({ where: { userId: id } });
        }
        return account;
      });
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An account with this email already exists");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundException("User not found");
      }
      throw error;
    }
  }

  async seed(): Promise<{ version: number; users: Array<{ id: string; email: string }>; orders: number }> {
    const password = process.env.DEVTOOLS_SEED_PASSWORD;
    if (!password || password.length < 8) {
      throw new BadRequestException("DEVTOOLS_SEED_PASSWORD must be set to at least 8 characters");
    }
    const fixture = await this.loadFixture();
    const emailConflicts = await this.prisma.user.findMany({
      where: {
        email: { in: fixture.users.map((user) => user.email) },
        id: { notIn: fixture.users.map((user) => user.id) },
      },
      select: { email: true },
    });
    if (emailConflicts.length > 0) {
      throw new ConflictException(
        `Seed fixture email is already used by another account: ${emailConflicts.map(({ email }) => email).join(", ")}`,
      );
    }

    const seedPasswordHash = await hashPassword(password);
    const now = new Date();
    const adminId = fixture.users.find((user) => user.role === UserRole.ADMIN)?.id;
    if (!adminId) throw new BadRequestException("Seed fixture must define an ADMIN user");

    await this.prisma.$transaction(async (tx) => {
      await this.deleteFixtureRecords(tx, fixture);

      for (const user of fixture.users) {
        await tx.user.create({
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerified: true,
            hourlyRate: user.hourlyRate === undefined ? null : new Prisma.Decimal(user.hourlyRate),
            createdAt: now,
            accounts: {
              create: {
                id: randomUUID(),
                accountId: user.id,
                providerId: "credential",
                password: seedPasswordHash,
              },
            },
          },
        });
      }

      for (const category of fixture.categories) {
        await tx.category.create({
          data: { ...category, createdById: adminId, createdAt: now },
        });
      }

      for (const order of fixture.orders) {
        await tx.workOrder.create({
          data: {
            id: order.id,
            title: order.title,
            description: order.description,
            status: order.status,
            customerId: order.customerId,
            executorId: order.executorId,
            categoryId: order.categoryId,
            createdAt: new Date(order.createdAt),
            dueAt: order.dueAt ? new Date(order.dueAt) : null,
            submittedAt: order.submittedAt ? new Date(order.submittedAt) : null,
            acceptedAt: order.acceptedAt ? new Date(order.acceptedAt) : null,
            completedAt: order.completedAt ? new Date(order.completedAt) : null,
            approvedHours: order.approvedHours === undefined ? null : new Prisma.Decimal(order.approvedHours),
            approvedHourlyRate: order.approvedHourlyRate === undefined ? null : new Prisma.Decimal(order.approvedHourlyRate),
            approvedAmount: order.approvedAmount === undefined ? null : new Prisma.Decimal(order.approvedAmount),
            statusHistory: {
              create: {
                changedById: order.customerId,
                fromStatus: null,
                toStatus: order.status,
                createdAt: new Date(order.createdAt),
              },
            },
            assignments: order.executorId
              ? {
                  create: {
                    executorId: order.executorId,
                    assignedById: adminId,
                    outcome: AssignmentOutcome.ACTIVE,
                    assignedAt: new Date(order.createdAt),
                  },
                }
              : undefined,
          },
        });
      }

      for (const comment of fixture.comments) {
        await tx.orderComment.create({
          data: { ...comment, createdAt: new Date(comment.createdAt) },
        });
      }

      for (const invoice of fixture.invoices) {
        await tx.invoice.create({
          data: {
            id: invoice.id,
            orderId: invoice.orderId,
            issuedById: invoice.issuedById,
            number: invoice.number,
            status: invoice.status,
            customerName: invoice.customerName,
            executorName: invoice.executorName,
            hours: new Prisma.Decimal(invoice.hours),
            hourlyRate: new Prisma.Decimal(invoice.hourlyRate),
            amount: new Prisma.Decimal(invoice.amount),
            issuedAt: new Date(invoice.issuedAt),
            paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
          },
        });
      }
    });

    return {
      version: fixture.version,
      users: fixture.users.map(({ id, email }) => ({ id, email })),
      orders: fixture.orders.length,
    };
  }

  async clearSeed(): Promise<{ version: number; deletedUsers: number; deletedOrders: number }> {
    const fixture = await this.loadFixture();
    return this.prisma.$transaction((tx) => this.deleteFixtureRecords(tx, fixture));
  }

  private async loadFixture(): Promise<SeedFixture> {
    const content = await readFile(fixtureUrl, "utf8");
    return JSON.parse(content) as SeedFixture;
  }

  private async deleteFixtureRecords(
    tx: Prisma.TransactionClient,
    fixture: SeedFixture,
  ): Promise<{ version: number; deletedUsers: number; deletedOrders: number }> {
    const orderIds = [...fixture.orders.map(({ id }) => id), ...retiredFixtureOrderIds];
    const invoiceIds = [...fixture.invoices.map(({ id }) => id), ...retiredFixtureInvoiceIds];
    const userIds = fixture.users.map(({ id }) => id);
    const categoryIds = fixture.categories.map(({ id }) => id);

    await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    const deletedOrders = await tx.workOrder.deleteMany({ where: { id: { in: orderIds } } });
    await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
    await tx.session.deleteMany({ where: { userId: { in: userIds } } });
    const deletedUsers = await tx.user.deleteMany({ where: { id: { in: userIds } } });

    return { version: fixture.version, deletedUsers: deletedUsers.count, deletedOrders: deletedOrders.count };
  }
}
