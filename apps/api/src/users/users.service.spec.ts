import "../env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { BadRequestException } from "@nestjs/common";
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
