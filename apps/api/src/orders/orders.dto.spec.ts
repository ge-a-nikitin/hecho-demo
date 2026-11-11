import "reflect-metadata";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { CancelOrderDto } from "./files.dto.js";
import { CreateOrderDto } from "./orders.dto.js";

describe("Orders", () => {
  describe("Request validation", () => {
    it(qc("orders.validation.whitespace-title", "rejects required strings that contain only whitespace"), async () => {
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

    it(
      qc("orders.validation.cancel-reason", "keeps the cancellation reason optional but bounded"),
      async () => {
        expect(await invalidProperties({})).toEqual([]);
        expect(await invalidProperties({ reason: "a".repeat(2000) })).toEqual([]);
        expect(await invalidProperties({ reason: "a".repeat(2001) })).toEqual(["reason"]);
        expect(await invalidProperties({ reason: 42 })).toEqual(["reason"]);
      },
    );
  });
});

async function invalidProperties(values: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(Object.assign(new CancelOrderDto(), values));

  return errors.map((error) => error.property).sort();
}

