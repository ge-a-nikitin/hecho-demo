import { describe, expect, it } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import { createFakeDatabase } from "../test-support/fake-database.js";
import { qc } from "../test-support/qase-case.js";
import { CategoriesService } from "./categories.service.js";

/**
 * Categories are a small catalogue, so the cases assert what a caller receives
 * and what the row looks like afterwards instead of the query behind it: a rename
 * that trims the name is only correct if the stored row is trimmed.
 */
describe("Categories", () => {
  describe("Catalogue", () => {
    it(qc("categories.list.hides-inactive", "keeps retired categories out of the default list"), async () => {
      const { service } = serviceWith({
        category: [
          { id: "category-1", name: "Plumbing", isActive: true },
          { id: "category-2", name: "Retired", isActive: false },
        ],
      });

      await expect(service.list(false)).resolves.toEqual([
        expect.objectContaining({ id: "category-1", name: "Plumbing" }),
      ]);
    });

    it(
      qc("categories.list.includes-inactive", "shows retired categories when asked for the full catalogue"),
      async () => {
        const { service } = serviceWith({
          category: [
            { id: "category-1", name: "Zebra", isActive: true },
            { id: "category-2", name: "Plumbing", isActive: false },
          ],
        });

        const listed = await service.list(true);

        expect(listed.map((category) => category.name)).toEqual(["Plumbing", "Zebra"]);
        expect(listed.map((category) => category.isActive)).toEqual([false, true]);
      },
    );

    it(qc("categories.create.trims-name", "stores a new category with its name trimmed"), async () => {
      const { db, service } = serviceWith({});

      const created = await service.create("  Repair ", "user-1");

      expect(created).toMatchObject({ name: "Repair", createdById: "user-1" });
      expect(db.rows("category")).toEqual([
        expect.objectContaining({ name: "Repair", createdById: "user-1", isActive: true }),
      ]);
    });

    it(qc("categories.rename.trims-name", "renames a category with its name trimmed"), async () => {
      const { db, service } = serviceWith({
        category: [{ id: "category-1", name: "Plumbing", isActive: true }],
      });

      await service.rename("category-1", " Painting ");

      expect(db.rows("category")).toEqual([
        expect.objectContaining({ id: "category-1", name: "Painting", isActive: true }),
      ]);
    });

    it(
      qc("categories.set-active.toggles-flag", "retires and restores a category without touching its name"),
      async () => {
        const { db, service } = serviceWith({
          category: [{ id: "category-1", name: "Plumbing", isActive: true }],
        });

        await service.setActive("category-1", false);
        expect(db.rows("category")[0]).toMatchObject({ name: "Plumbing", isActive: false });

        await service.setActive("category-1", true);
        expect(db.rows("category")[0]).toMatchObject({ name: "Plumbing", isActive: true });
      },
    );
  });
});

function serviceWith(seed: Parameters<typeof createFakeDatabase>[0] = {}) {
  const db = createFakeDatabase(seed);

  return { db, service: new CategoriesService(db.prisma as unknown as PrismaService) };
}
