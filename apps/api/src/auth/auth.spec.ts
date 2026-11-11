import { describe, expect, it, vi } from "vitest";
import { qc } from "../test-support/qase-case.js";

/**
 * Importing the authentication and database modules used to require
 * `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `DATABASE_URL`, which forced every
 * offline suite to invent placeholders. Nothing here replaces the modules: the
 * case proves they load without their settings and still demand them on first
 * use, so a misconfigured deployment fails loudly instead of quietly.
 */
describe("Auth", () => {
  describe("Configuration", () => {
    it(
      qc("auth.config.lazy", "loads the auth and database modules without their settings"),
      async () => {
        const previous = {
          url: process.env.BETTER_AUTH_URL,
          secret: process.env.BETTER_AUTH_SECRET,
          database: process.env.DATABASE_URL,
        };
        delete process.env.BETTER_AUTH_URL;
        delete process.env.BETTER_AUTH_SECRET;
        delete process.env.DATABASE_URL;

        try {
          vi.resetModules();

          const { auth } = await import("./auth.js");
          await import("../database/prisma.service.js");

          let failure: unknown;
          try {
            await auth.api.getSession({ headers: new Headers() });
          } catch (error) {
            failure = error;
          }

          expect(failure).toBeInstanceOf(Error);
          expect(String((failure as Error).message)).toContain("BETTER_AUTH_URL is required");
        } finally {
          restoreEnv("BETTER_AUTH_URL", previous.url);
          restoreEnv("BETTER_AUTH_SECRET", previous.secret);
          restoreEnv("DATABASE_URL", previous.database);
        }
      },
    );
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
