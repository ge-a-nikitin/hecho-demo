import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
import { authRateLimitOptions } from "./rate-limit.js";

/**
 * Better Auth enables its limiter only when `NODE_ENV` is "production", and the
 * API image ran without `NODE_ENV`, so `/api/auth/*` accepted unlimited password
 * guesses and registrations. The settings are resolved here instead, from the
 * environment, so the limiter no longer depends on how the container happens to
 * be started - and a mistyped value fails at startup instead of quietly turning
 * a security control off.
 */
describe("Auth", () => {
  describe("Rate limiting", () => {
    it(
      qc("auth.rate-limit.defaults", "keeps the limiter on with the defaults the application documents"),
      () => {
        const options = authRateLimitOptions({});

        expect(options.enabled).toBe(true);
        expect(options.window).toBe(60);
        expect(options.max).toBe(60);
        expect(options.customRules).toEqual({
          "/sign-in/*": { window: 60, max: 5 },
          "/sign-up/*": { window: 60, max: 5 },
        });
      },
    );

    it(
      qc("auth.rate-limit.environment", "reads the switch, the window and the limit from the environment"),
      () => {
        const options = authRateLimitOptions({
          AUTH_RATE_LIMIT_ENABLED: "false",
          AUTH_RATE_LIMIT_WINDOW: "30",
          AUTH_RATE_LIMIT_MAX: "120",
          AUTH_SIGN_IN_RATE_LIMIT_WINDOW: "10",
          AUTH_SIGN_IN_RATE_LIMIT_MAX: "3",
        });

        expect(options).toEqual({
          enabled: false,
          window: 30,
          max: 120,
          customRules: {
            "/sign-in/*": { window: 10, max: 3 },
            "/sign-up/*": { window: 10, max: 3 },
          },
        });
      },
    );

    it(
      qc("auth.rate-limit.invalid", "refuses a value it cannot read instead of silently ignoring the setting"),
      () => {
        const invalid = [
          ["AUTH_RATE_LIMIT_MAX", "0"],
          ["AUTH_RATE_LIMIT_WINDOW", "-5"],
          ["AUTH_SIGN_IN_RATE_LIMIT_MAX", "soon"],
          ["AUTH_RATE_LIMIT_ENABLED", "maybe"],
        ] as const;

        for (const [name, value] of invalid) {
          expect(() => authRateLimitOptions({ [name]: value }), `${name}=${value}`).toThrow(name);
        }
      },
    );
  });
});
