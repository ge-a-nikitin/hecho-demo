import "reflect-metadata";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { RejectPaymentReportDto, VoidInvoiceDto } from "./invoices.dto.js";

describe("Invoices", () => {
  describe("Request validation", () => {
    it(
      qc("invoices.validation.void-reason", "requires a non-blank reason to void an invoice"),
      async () => {
        expect(await invalidProperties(new VoidInvoiceDto(), { reason: "a".repeat(2000) })).toEqual([]);
        expect(await invalidProperties(new VoidInvoiceDto(), { reason: "a".repeat(2001) })).toEqual([
          "reason",
        ]);
        expect(await invalidProperties(new VoidInvoiceDto(), { reason: "  \n " })).toEqual(["reason"]);
      },
    );

    it(
      qc(
        "invoices.validation.reject-reason",
        "requires a non-blank reason to reject a payment report",
      ),
      async () => {
        expect(
          await invalidProperties(new RejectPaymentReportDto(), { reason: "Receipt is unreadable" }),
        ).toEqual([]);
        expect(await invalidProperties(new RejectPaymentReportDto(), { reason: "" })).toEqual([
          "reason",
        ]);
      },
    );
  });
});

async function invalidProperties(dto: object, values: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(Object.assign(dto, values));

  return errors.map((error) => error.property).sort();
}
