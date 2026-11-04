import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive: boolean) {
    return this.prisma.category.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  create(name: string, createdById: string) {
    return this.prisma.category.create({
      data: { name: name.trim(), createdById },
    });
  }

  rename(id: string, name: string) {
    return this.prisma.category.update({
      where: { id },
      data: { name: name.trim() },
    });
  }

  setActive(id: string, isActive: boolean) {
    return this.prisma.category.update({
      where: { id },
      data: { isActive },
    });
  }
}
