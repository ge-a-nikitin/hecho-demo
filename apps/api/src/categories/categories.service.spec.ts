import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { qc } from "../test-support/qase-case.js";
import { CategoriesService } from "./categories.service.js";

describe("Categories", () => {
  describe("Catalogue", () => {
    it(qc("categories.list.hides-inactive", "keeps retired categories out of the default list"), async () => {
      await service().list(false);

      expect(findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: "asc" } });
    });

    it(
      qc("categories.list.includes-inactive", "shows retired categories when asked for the full catalogue"),
      async () => {
        await service().list(true);

        expect(findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { name: "asc" } });
      },
    );

    it(qc("categories.create.trims-name", "stores a new category with its name trimmed"), async () => {
      await service().create("  Repair ", "user-1");

      expect(create).toHaveBeenCalledWith({ data: { name: "Repair", createdById: "user-1" } });
    });

    it(qc("categories.rename.trims-name", "renames a category with its name trimmed"), async () => {
      await service().rename("category-1", " Painting ");

      expect(update).toHaveBeenCalledWith({ where: { id: "category-1" }, data: { name: "Painting" } });
    });

    it(
      qc("categories.set-active.toggles-flag", "retires and restores a category without touching its name"),
      async () => {
        const categories = service();

        await categories.setActive("category-1", false);
        await categories.setActive("category-1", true);

        expect(update).toHaveBeenNthCalledWith(1, { where: { id: "category-1" }, data: { isActive: false } });
        expect(update).toHaveBeenNthCalledWith(2, { where: { id: "category-1" }, data: { isActive: true } });
      },
    );
  });
});

const findMany = vi.fn();
const create = vi.fn();
const update = vi.fn();

function service(): CategoriesService {
  return new CategoriesService({
    category: { findMany, create, update },
  } as unknown as PrismaService);
}
