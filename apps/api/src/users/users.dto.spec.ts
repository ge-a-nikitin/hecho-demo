import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import {
  CreateExecutorDto,
  UpdateExecutorDto,
  UpdateHourlyRateDto,
  UpdateOwnProfileDto,
} from "./users.dto.js";

describe("Users", () => {
  describe("Request validation", () => {
    it(
      qc(
        "users.validation.executor-name",
        "rejects an executor name that is blank or longer than 120 characters",
      ),
      async () => {
        const account = { email: "executor@example.test", password: "12345678" };

        expect(
          await invalidProperties(new CreateExecutorDto(), { ...account, name: "a".repeat(120) }),
        ).toEqual([]);
        expect(
          await invalidProperties(new CreateExecutorDto(), { ...account, name: "a".repeat(121) }),
        ).toEqual(["name"]);
        expect(await invalidProperties(new UpdateExecutorDto(), { name: " \t " })).toEqual(["name"]);
        expect(await invalidProperties(new UpdateExecutorDto(), {})).toEqual([]);
      },
    );

    it(
      qc("users.validation.hourly-rate", "keeps the hourly rate positive with at most four decimals"),
      async () => {
        expect(await rateErrors({ hourlyRate: 0.0001 })).toEqual([]);
        expect(await rateErrors({ hourlyRate: 1_000_000 })).toEqual([]);
        expect(await rateErrors({ hourlyRate: 0 })).toEqual(["hourlyRate"]);
        expect(await rateErrors({ hourlyRate: 0.00001 })).toEqual(["hourlyRate"]);
        expect(await rateErrors({ hourlyRate: 45.12345 })).toEqual(["hourlyRate"]);
        expect(await rateErrors({ hourlyRate: 1_000_001 })).toEqual(["hourlyRate"]);
        expect(await rateErrors({ hourlyRate: "45.5" })).toEqual([]);
        expect(await rateErrors({ hourlyRate: "not-a-rate" })).toEqual(["hourlyRate"]);
      },
    );

    it(
      qc(
        "users.validation.profile",
        "requires the current password and a real change in the profile update",
      ),
      async () => {
        expect(
          await invalidProperties(new UpdateOwnProfileDto(), {
            name: "Jane R. Doe",
            email: "jane.doe@example.test",
            currentPassword: "Password123!",
          }),
        ).toEqual([]);
        expect(await invalidProperties(new UpdateOwnProfileDto(), { currentPassword: "x" })).toEqual([]);
        expect(await invalidProperties(new UpdateOwnProfileDto(), { name: "Jane" })).toEqual([
          "currentPassword",
        ]);
        expect(
          await invalidProperties(new UpdateOwnProfileDto(), {
            name: "   ",
            currentPassword: "Password123!",
          }),
        ).toEqual(["name"]);
      },
    );
  });
});

async function invalidProperties(dto: object, values: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(Object.assign(dto, values));

  return errors.map((error) => error.property).sort();
}

/** The pipe transforms the body before validation, so a form string must reach the service as a number. */
async function rateErrors(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateHourlyRateDto, body));

  return errors.map((error) => error.property).sort();
}
