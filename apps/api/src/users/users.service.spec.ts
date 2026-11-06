import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { UserRole } from "../generated/prisma/enums.js";
import type { PrismaService } from "../database/prisma.service.js";
import { UsersService } from "./users.service.js";

describe("UsersService profile updates", () => {
  it("requires the current password and normalizes updated profile data", async () => {
    const storedHash = await hashPassword("current-password");
    let updateData: Record<string, unknown> | undefined;
    const service = createService(storedHash, (data) => {
      updateData = data;
      return {
        id: "user-1",
        name: data.name,
        email: data.email,
        emailVerified: data.emailVerified ?? true,
        role: "CUSTOMER",
      };
    });

    await service.updateOwnProfile("user-1", {
      currentPassword: "current-password",
      name: "  New Name  ",
      email: "NEW@example.test",
    });

    assert.equal(updateData?.name, "New Name");
    assert.equal(updateData?.email, "new@example.test");
    assert.equal(updateData?.emailVerified, false);
  });

  it("does not update profile data when the current password is incorrect", async () => {
    const storedHash = await hashPassword("current-password");
    let didUpdate = false;
    const service = createService(storedHash, () => {
      didUpdate = true;
      return {};
    });

    await assert.rejects(
      service.updateOwnProfile("user-1", {
        currentPassword: "wrong-password",
        name: "New Name",
      }),
      BadRequestException,
    );
    assert.equal(didUpdate, false);
  });
});

describe("UsersService executor rates", () => {
  it("lets an active executor set their own hourly rate", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const profile = {
      id: "executor-1",
      name: "Executor",
      email: "executor@example.test",
      role: UserRole.EXECUTOR,
      isActive: true,
      hourlyRate: new Prisma.Decimal("45.5"),
    };
    const service = new UsersService({
      user: {
        updateMany: async (args: Record<string, unknown>) => {
          updateArgs = args;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => profile,
      },
    } as unknown as PrismaService);

    const result = await service.updateOwnHourlyRate("executor-1", 45.5);

    assert.deepEqual(updateArgs?.where, {
      id: "executor-1",
      role: UserRole.EXECUTOR,
      isActive: true,
    });
    assert.ok((updateArgs?.data as Record<string, unknown>).hourlyRate instanceof Prisma.Decimal);
    assert.equal(result.hourlyRate?.toString(), "45.5");
  });

  it("rejects a rate update when the account is not an active executor", async () => {
    const service = new UsersService({
      user: {
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaService);

    await assert.rejects(
      service.updateOwnHourlyRate("customer-1", 45),
      NotFoundException,
    );
  });

  it("lists only active executors for customer selection", async () => {
    let query: Record<string, unknown> | undefined;
    const service = new UsersService({
      user: {
        findMany: async (args: Record<string, unknown>) => {
          query = args;
          return [];
        },
      },
    } as unknown as PrismaService);

    await service.listAvailableExecutors();

    assert.deepEqual(query?.where, { role: UserRole.EXECUTOR, isActive: true });
    assert.deepEqual(query?.select, { id: true, name: true });
  });
});

function createService(
  password: string,
  updateUser: (data: Record<string, unknown>) => unknown,
): UsersService {
  const prisma = {
    account: {
      findFirst: async () => ({ id: "account-1", password }),
    },
    user: {
      update: async ({ data }: { data: Record<string, unknown> }) => updateUser(data),
    },
  };
  return new UsersService(prisma as unknown as PrismaService);
}
