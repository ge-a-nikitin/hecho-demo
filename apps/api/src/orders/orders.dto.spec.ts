import "reflect-metadata";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateOrderDto } from "./orders.dto.js";

describe("Orders", () => {
  describe("Request validation", () => {
    it("rejects required strings that contain only whitespace", async () => {
      const errors = await validate(
        Object.assign(new CreateOrderDto(), {
          title: "   ",
          description: "A valid description",
          categoryId: "category-1",
        }),
      );

      expect(errors.some((error) => error.property === "title")).toBe(true);
      expect(errors.some((error) => error.property === "description")).toBe(false);
    });
  });
});
