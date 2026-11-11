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
        await withEnv(
          { BETTER_AUTH_URL: undefined, BETTER_AUTH_SECRET: undefined, DATABASE_URL: undefined },
          async () => {
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
          },
        );
      },
    );

    it(
      qc("auth.config.mounts-handler", "answers the handler probe the node adapter mounts it with"),
      async () => {
        await withEnv(
          {
            BETTER_AUTH_URL: "http://127.0.0.1:6209/api/auth",
            BETTER_AUTH_SECRET: "unit-test-secret-at-least-32-characters",
            DATABASE_URL: "postgresql://unit-test:unit-test@127.0.0.1:5432/unit-test",
          },
          async () => {
            vi.resetModules();

            const { auth } = await import("./auth.js");

            // `toNodeHandler` mounts `auth.handler` only when this probe answers
            // true; without it the adapter hands the object to express instead.
            expect("handler" in auth).toBe(true);
            expect(typeof auth.handler).toBe("function");
          },
        );
      },
    );
  });
});

/** Runs a case with environment overrides, restoring the previous values afterwards. */
async function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [name, value] of previous) {
      restoreEnv(name, value);
    }
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
