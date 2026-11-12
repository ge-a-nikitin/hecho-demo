import { beforeAll, describe, expect, it } from "vitest";
import { qc } from "../../src/test-support/qase-case.js";
import { createActor, resetWorld, waitForApi, type Actor } from "./helpers/stack.js";

/**
 * The unit cases pin the resolved settings, but only the running API can show
 * that a caller actually meets them. The case uses `/change-password`, which
 * keeps Better Auth's built-in rule of 3 attempts per 10 seconds: the stack
 * raises the configured sign-in and general limits because the suite signs in
 * dozens of times from one address, while this path stays strict and cheap.
 */

let customer: Actor;

beforeAll(async () => {
  await waitForApi();
  await resetWorld();

  customer = await createActor("CUSTOMER");
});

describe("Auth", () => {
  describe("Rate limiting", () => {
    it(
      qc("auth.rate-limit.enforced", "answers the fourth password change within ten seconds with a 429"),
      async () => {
        const attempts = [];

        for (let attempt = 1; attempt <= 4; attempt += 1) {
          attempts.push(
            await customer.post<{ message: string }>("/auth/change-password", {
              currentPassword: "wrong-current-password",
              newPassword: "replacement-password-2",
            }),
          );
        }

        // The three allowed attempts reach the handler and fail on the password,
        // which is what makes the fourth one prove the limiter rather than a
        // missing session or a malformed body.
        expect(attempts.slice(0, 3).map((response) => response.status)).toEqual([400, 400, 400]);
        expect(attempts[3]?.status).toBe(429);
        expect(attempts[3]?.body.message).toContain("Too many requests");

        // The limit belongs to the path, not to the account: the same session
        // keeps working everywhere else.
        const profile = await customer.get("/users/me");
        expect(profile.status).toBe(200);
      },
    );
  });
});
