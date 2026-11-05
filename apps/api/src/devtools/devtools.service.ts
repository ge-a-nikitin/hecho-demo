import {
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { UserRole } from "../generated/prisma/enums.js";
import { auth } from "../auth/auth.js";
import { PrismaService } from "../database/prisma.service.js";

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
}
