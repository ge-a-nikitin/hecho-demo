import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { createApiErrorResponse } from "../api-exception.filter.js";

describe("API error responses", () => {
  it("adds a stable code and preserves validation messages", () => {
    assert.deepEqual(
      createApiErrorResponse(new BadRequestException(["title must be longer"])),
      {
        statusCode: 400,
        code: "BAD_REQUEST",
        message: ["title must be longer"],
        error: "Bad Request",
      },
    );
  });

  it("distinguishes forbidden operations from missing records", () => {
    assert.equal(createApiErrorResponse(new ForbiddenException()).code, "FORBIDDEN");
    assert.equal(createApiErrorResponse(new NotFoundException()).code, "NOT_FOUND");
  });

  it("does not expose unexpected server error details", () => {
    const response = createApiErrorResponse(new Error("database credentials leaked"));
    assert.deepEqual(response, {
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
      error: "Internal Server Error",
    });
  });

  it("converts oversized uploads into a client error", () => {
    const error = Object.assign(new Error("size limit"), {
      name: "MulterError",
      code: "LIMIT_FILE_SIZE",
    });
    const response = createApiErrorResponse(error);
    assert.equal(response.statusCode, 413);
    assert.equal(response.code, "PAYLOAD_TOO_LARGE");
  });

  it("maps database uniqueness violations to a conflict response", () => {
    const error = new Prisma.PrismaClientKnownRequestError("duplicate key", {
      code: "P2002",
      clientVersion: "test",
    });
    const response = createApiErrorResponse(error);
    assert.equal(response.statusCode, 409);
    assert.equal(response.code, "CONFLICT");
  });
});
