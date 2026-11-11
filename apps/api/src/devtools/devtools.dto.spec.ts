import "reflect-metadata";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { UserRole } from "../generated/prisma/enums.js";
import { qc } from "../test-support/qase-case.js";
import { CreateDevToolUserDto, ResetDevToolsDataDto, UpdateDevToolUserDto } from "./devtools.dto.js";

describe("DevTools", () => {
  describe("Request validation", () => {
    it(
      qc("devtools.validation.reset-confirmation", "accepts a reset only with the confirmation phrase"),
      async () => {
        expect(await invalidProperties(new ResetDevToolsDataDto(), { confirm: "reset-all-data" })).toEqual(
          [],
        );
        expect(await invalidProperties(new ResetDevToolsDataDto(), { confirm: "reset" })).toEqual([
          "confirm",
        ]);
        expect(
          await invalidProperties(new ResetDevToolsDataDto(), {
            confirm: "reset-all-data",
            purgeFiles: "yes",
          }),
        ).toEqual(["purgeFiles"]);
        expect(
          await invalidProperties(new ResetDevToolsDataDto(), {
            confirm: "reset-all-data",
            purgeFiles: false,
          }),
        ).toEqual([]);
      },
    );

    it(
      qc("devtools.validation.create-user", "validates the role, email and password of a test account"),
      async () => {
        const valid = { role: UserRole.CUSTOMER, email: "devtools@example.test", password: "12345678" };

        expect(await invalidProperties(new CreateDevToolUserDto(), valid)).toEqual([]);
        expect(await invalidProperties(new CreateDevToolUserDto(), { ...valid, role: "customer" })).toEqual(
          ["role"],
        );
        expect(await invalidProperties(new CreateDevToolUserDto(), { ...valid, password: "1234567" })).toEqual(
          ["password"],
        );
        expect(
          await invalidProperties(new CreateDevToolUserDto(), { ...valid, email: "not-an-email" }),
        ).toEqual(["email"]);
        expect(await invalidProperties(new UpdateDevToolUserDto(), {})).toEqual([]);
        expect(await invalidProperties(new UpdateDevToolUserDto(), { isActive: "no" })).toEqual([
          "isActive",
        ]);
      },
    );
  });
});

async function invalidProperties(dto: object, values: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(Object.assign(dto, values));

  return errors.map((error) => error.property).sort();
}
