import "reflect-metadata";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { CreateCategoryDto, UpdateCategoryDto } from "./category.dto.js";

describe("Categories", () => {
  describe("Request validation", () => {
    it(
      qc("categories.validation.create", "rejects a category name that is blank or over the length limit"),
      async () => {
        expect(await invalidProperties(new CreateCategoryDto(), { name: "a".repeat(100) })).toEqual([]);
        expect(await invalidProperties(new CreateCategoryDto(), { name: "a".repeat(101) })).toEqual(["name"]);
        expect(await invalidProperties(new CreateCategoryDto(), { name: "   " })).toEqual(["name"]);
        expect(await invalidProperties(new CreateCategoryDto(), { name: "" })).toEqual(["name"]);
      },
    );

    it(
      qc("categories.validation.rename", "applies the same rules when a category is renamed"),
      async () => {
        const errors = await invalidProperties(new UpdateCategoryDto(), { name: "a".repeat(101) });

        expect(errors).toEqual(["name"]);
      },
    );
  });
});

async function invalidProperties(dto: object, values: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(Object.assign(dto, values));

  return errors.map((error) => error.property).sort();
}
