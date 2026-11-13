import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { orderQuotas } from "./order-quotas.js";

/**
 * Registration is open to any visitor, and every attachment costs up to 1 MB on
 * the volume that shares the machine with the database and the API, so the
 * limits on a single order, on a day of uploads and on the open orders of one
 * customer are the only thing between a new account and a full disk. They are
 * resolved here so the values are documented, testable and changeable without a
 * rebuild - and a mistyped value fails at startup instead of silently removing a
 * quota.
 */
describe("Orders", () => {
  describe("Quotas", () => {
    it(
      qc("orders.quotas.defaults", "keeps the documented quotas when nothing is configured"),
      () => {
        expect(orderQuotas({})).toEqual({
          attachmentsPerOrder: 20,
          attachmentsPerDay: 100,
          openOrdersPerCustomer: 20,
        });
      },
    );

    it(
      qc("orders.quotas.environment", "reads the three quotas from the environment"),
      () => {
        const quotas = orderQuotas({
          ORDER_ATTACHMENT_LIMIT: "5",
          ORDER_ATTACHMENT_DAILY_LIMIT: "30",
          ORDER_OPEN_LIMIT: "3",
        });

        expect(quotas).toEqual({
          attachmentsPerOrder: 5,
          attachmentsPerDay: 30,
          openOrdersPerCustomer: 3,
        });
      },
    );

    it(
      qc("orders.quotas.invalid", "refuses a quota it cannot read instead of ignoring the setting"),
      () => {
        const invalid = [
          ["ORDER_ATTACHMENT_LIMIT", "0"],
          ["ORDER_ATTACHMENT_DAILY_LIMIT", "-1"],
          ["ORDER_OPEN_LIMIT", "many"],
        ] as const;

        for (const [name, value] of invalid) {
          expect(() => orderQuotas({ [name]: value }), `${name}=${value}`).toThrow(name);
        }
      },
    );
  });
});
