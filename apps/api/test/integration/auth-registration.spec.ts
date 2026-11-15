import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { qc } from "../../src/test-support/qase-case.js";
import {
  actor,
  request,
  resetWorld,
  signInAdmin,
  signUp,
  waitForApi,
  type Actor,
} from "./helpers/stack.js";

/**
 * Registration is open to any visitor by design, so what a visitor ends up being
 * is a product decision worth pinning. The unit suite cannot reach it: the route
 * belongs to Better Auth, and the cases need the real session cookie a sign-up
 * returns to tell an active account from a deactivated one.
 */

const PASSWORD = "integration-test-password";

type Profile = { id: string; email: string; role: string };
type ListedCustomer = { id: string; email: string; isActive: boolean };
type ApiError = { statusCode: number; code: string; message: string | string[] };

let admin: Actor;

beforeAll(async () => {
  await waitForApi();
  await resetWorld();

  admin = await signInAdmin();
});

function visitorEmail(): string {
  return `visitor-${randomUUID()}@example.test`;
}

describe("Auth (integration)", () => {
  describe("Registration", () => {
    it(
      qc(
        "integration.auth.self-registration",
        "registers a visitor as an active customer without an administrator",
      ),
      async () => {
        const email = visitorEmail();

        const created = await signUp({
          name: "Self-registered visitor",
          email,
          password: PASSWORD,
        });

        expect(created.status).toBe(200);
        expect(created.cookie).not.toBe("");

        const profile = await request<Profile>("GET", "/users/me", { cookie: created.cookie });
        expect(profile.status).toBe(200);
        expect(profile.body).toMatchObject({ email, role: "CUSTOMER" });

        // A profile that answers proves the account is active, and the
        // administrator's list states the same thing explicitly - it is the list
        // the console deactivates an account from.
        const listed = await admin.get<ListedCustomer[]>("/users/customers?includeInactive=true");
        expect(listed.status).toBe(200);
        expect(listed.body.find((account) => account.id === profile.body.id)).toMatchObject({
          email,
          isActive: true,
        });
      },
    );

    it(
      qc(
        "integration.auth.registration-ignores-privileged-input",
        "keeps a self-registered visitor a customer when the body asks for an administrator",
      ),
      async () => {
        const email = visitorEmail();

        // The sign-up route is Better Auth's, so `input: false` on `role` and
        // `isActive` is the only thing between a crafted body and a privileged
        // account. The body below is what such a request sends.
        const created = await signUp({
          name: "Crafted visitor",
          email,
          password: PASSWORD,
          role: "ADMIN",
          isActive: false,
        });
        expect(created.status).toBe(200);

        const profile = await request<Profile>("GET", "/users/me", { cookie: created.cookie });
        expect(profile.status).toBe(200);
        expect(profile.body).toMatchObject({ email, role: "CUSTOMER" });

        const visitor = actor(profile.body.id, email, created.cookie);
        const adminOnly = await visitor.post<ApiError>("/categories", {
          name: `Not allowed ${randomUUID()}`,
        });
        expect(adminOnly.status).toBe(403);
        expect(adminOnly.body).toMatchObject({ code: "FORBIDDEN" });

        const listed = await admin.get<ListedCustomer[]>("/users/customers?includeInactive=true");
        expect(listed.body.find((account) => account.id === profile.body.id)).toMatchObject({
          email,
          isActive: true,
        });
      },
    );
  });
});
