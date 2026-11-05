import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { OrderStatus, UserRole } from "../generated/prisma/enums.js";
import { auth } from "../auth/auth.js";
import { PrismaService } from "../database/prisma.service.js";
import type { CreateExecutorDto, UpdateExecutorDto, UpdateOwnProfileDto } from "./users.dto.js";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listExecutors(includeInactive: boolean) {
    return this.prisma.user.findMany({
      where: {
        role: UserRole.EXECUTOR,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        hourlyRate: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });
  }

  listCustomers(includeInactive: boolean) {
    return this.prisma.user.findMany({
      where: {
        role: UserRole.CUSTOMER,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async createExecutor(dto: CreateExecutorDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("An account with this email already exists");

    let createdUserId: string | undefined;
    try {
      const result = await auth.api.signUpEmail({
        body: {
          name: dto.name.trim(),
          email,
          password: dto.password,
        },
      });
      createdUserId = result.user.id;
      const user = await this.prisma.user.update({
        where: { id: createdUserId },
        data: {
          role: UserRole.EXECUTOR,
          hourlyRate: new Prisma.Decimal(dto.hourlyRate),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          hourlyRate: true,
          createdAt: true,
        },
      });
      await this.prisma.session.deleteMany({ where: { userId: createdUserId } });
      return user;
    } catch (error) {
      if (createdUserId) {
        await this.prisma.user.delete({ where: { id: createdUserId } });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An account with this email already exists");
      }
      throw error;
    }
  }

  async updateOwnProfile(
    id: string,
    dto: UpdateOwnProfileDto,
  ) {
    if (dto.name === undefined && dto.email === undefined) {
      throw new BadRequestException("Provide a name or email to update");
    }

    const account = await this.prisma.account.findFirst({
      where: { userId: id, providerId: "credential" },
      select: { id: true, password: true },
    });
    if (!account?.password) {
      throw new BadRequestException("This account cannot verify its current password");
    }
    if (!await verifyPassword({ hash: account.password, password: dto.currentPassword })) {
      throw new BadRequestException({
        code: "INVALID_CREDENTIALS",
        message: "The current password is incorrect",
      });
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          email: dto.email?.trim().toLowerCase(),
          emailVerified: dto.email === undefined ? undefined : false,
        },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          role: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundException("User not found");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An account with this email already exists");
      }
      throw error;
    }
  }

  async updateExecutor(id: string, dto: UpdateExecutorDto) {
    try {
      return await this.prisma.user.update({
        where: { id, role: UserRole.EXECUTOR },
        data: {
          name: dto.name?.trim(),
          hourlyRate: dto.hourlyRate === undefined ? undefined : new Prisma.Decimal(dto.hourlyRate),
        },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          hourlyRate: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundException("Executor not found");
      }
      throw error;
    }
  }

  async resetPassword(id: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        role: { in: [UserRole.CUSTOMER, UserRole.EXECUTOR] },
        isActive: true,
      },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("Active customer or executor not found");

    const passwordAccount = await this.prisma.account.findFirst({
      where: { userId: id, providerId: "credential" },
      select: { id: true },
    });
    if (!passwordAccount) throw new BadRequestException("Executor has no password account");

    const hashedPassword = await hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: passwordAccount.id },
        data: { password: hashedPassword },
      }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    return { success: true };
  }

  async setActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: { in: [UserRole.CUSTOMER, UserRole.EXECUTOR] } },
      select: { id: true, role: true, isActive: true },
    });
    if (!user) throw new NotFoundException("Customer or executor not found");
    if (user.isActive === isActive) {
      return this.prisma.user.findUniqueOrThrow({
        where: { id },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.user.updateMany({
        where: { id, role: user.role, isActive: !isActive },
        data: { updatedAt: new Date() },
      });
      if (locked.count !== 1) throw new ConflictException("User account has already changed");

      if (!isActive && user.role === UserRole.EXECUTOR) {
        const activeOrders = await tx.workOrder.count({
          where: {
            executorId: id,
            status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
          },
        });
        if (activeOrders > 0) {
          throw new ConflictException("Reassign all unfinished orders before deactivating this executor");
        }
      }

      const account = await tx.user.update({
        where: { id },
        data: { isActive },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
      if (!isActive) await tx.session.deleteMany({ where: { userId: id } });
      return account;
    });
    return updated;
  }
}
