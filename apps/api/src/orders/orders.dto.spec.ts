import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate } from "class-validator";
import { CreateOrderDto } from "./orders.dto.js";

describe("order request validation", () => {
  it("rejects required strings that contain only whitespace", async () => {
    const errors = await validate(Object.assign(new CreateOrderDto(), {
      title: "   ",
      description: "A valid description",
      categoryId: "category-1",
    }));

    assert.ok(errors.some((error) => error.property === "title"));
    assert.equal(errors.some((error) => error.property === "description"), false);
  });
});
