import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { Prisma } from "../generated/prisma/client.js";
import { createApiErrorResponse } from "../api-exception.filter.js";

describe("API", () => {
  describe("Error responses", () => {
    it(qc("api.error-responses.validation-code", "adds a stable code and preserves validation messages"), () => {
      expect(createApiErrorResponse(new BadRequestException(["title must be longer"]))).toEqual({
        statusCode: 400,
        code: "BAD_REQUEST",
        message: ["title must be longer"],
        error: "Bad Request",
      });
    });

    it(qc("api.error-responses.forbidden-vs-not-found", "distinguishes forbidden operations from missing records"), () => {
      expect(createApiErrorResponse(new ForbiddenException()).code).toBe("FORBIDDEN");
      expect(createApiErrorResponse(new NotFoundException()).code).toBe("NOT_FOUND");
    });

    it(qc("api.error-responses.hides-server-details", "does not expose unexpected server error details"), () => {
      expect(createApiErrorResponse(new Error("database credentials leaked"))).toEqual({
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
        error: "Internal Server Error",
      });
    });

    it(qc("api.error-responses.oversized-upload", "converts oversized uploads into a client error"), () => {
      const error = Object.assign(new Error("size limit"), {
        name: "MulterError",
        code: "LIMIT_FILE_SIZE",
      });

      const response = createApiErrorResponse(error);

      expect(response.statusCode).toBe(413);
      expect(response.code).toBe("PAYLOAD_TOO_LARGE");
    });

    it(qc("api.error-responses.unique-violation", "maps database uniqueness violations to a conflict response"), () => {
      const error = new Prisma.PrismaClientKnownRequestError("duplicate key", {
        code: "P2002",
        clientVersion: "test",
      });

      const response = createApiErrorResponse(error);

      expect(response.statusCode).toBe(409);
      expect(response.code).toBe("CONFLICT");
    });
  });
});
