// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { renderAppAt } from "./support/render-app";

const { auth } = vi.hoisted(() => ({
  auth: {
    hook: {
      data: {
        user: { id: "customer-1", name: "Ada Lovelace", email: "ada@example.com", role: "CUSTOMER" },
      } as { user: Record<string, string> } | null,
      isPending: false,
    },
  },
}));

const customerSession = {
  user: { id: "customer-1", name: "Ada Lovelace", email: "ada@example.com", role: "CUSTOMER" },
};

vi.mock("../../src/auth-client", () => ({
  authClient: {
    useSession: () => auth.hook,
    getSession: async () => ({ data: { user: auth.hook.data?.user, session: { id: "session-1" } }, error: null }),
    signOut: async () => ({ data: null, error: null }),
  },
}));

afterEach(() => {
  auth.hook.data = customerSession;
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("Web", () => {
  describe("Landing page", () => {
    it(
      qc("web.landing.register-label", "labels the hero button of a returning customer as a registration action"),
      () => {
        renderAppAt("/");

        const hero = screen.getByTestId("hero-register");
        expect(hero).toHaveTextContent("Register");
        // The wording changed, the destination did not: a signed-in customer
        // still lands in the workspace instead of on the registration form.
        expect(hero).toHaveAttribute("href", "/customer");
      },
    );

    it(
      qc("web.landing.guest-register-label", "labels the hero button of a guest as a registration action"),
      () => {
        auth.hook.data = null;

        renderAppAt("/");

        const hero = screen.getByTestId("hero-register");
        expect(hero).toHaveTextContent("Register");
        // The button opens the registration form, so it must not promise an
        // order that the visitor cannot create before signing up.
        expect(hero).toHaveAttribute("href", "/register");
      },
    );
  });
});
