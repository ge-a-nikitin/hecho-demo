// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { installFakeApi } from "./support/fake-api";
import { customerPanelRoutes } from "./support/fixtures";
import { renderAppAt } from "./support/render-app";

type SessionUser = { id: string; name: string; email: string; role: string };

/**
 * The authentication client keeps the session it fetched last in a store-wide
 * atom, so a panel can mount with the answer from before a sign-in still in the
 * atom. These cases pin that state: `staleHook` is what `useSession` returns,
 * `serverUser` is what a fresh `getSession` call answers.
 */
const { auth } = vi.hoisted(() => ({
  auth: {
    staleHook: { data: null as { user: SessionUser } | null, isPending: false },
    serverUser: null as SessionUser | null,
    getSessionCalls: 0,
  },
}));

vi.mock("../../src/auth-client", () => ({
  authClient: {
    useSession: () => auth.staleHook,
    getSession: async () => {
      auth.getSessionCalls += 1;

      return {
        data: auth.serverUser ? { user: auth.serverUser, session: { id: "session-1" } } : null,
        error: null,
      };
    },
    signIn: { email: async () => ({ data: { user: auth.serverUser }, error: null }) },
    signOut: async () => ({ data: null, error: null }),
  },
}));

const customer: SessionUser = {
  id: "customer-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "CUSTOMER",
};

beforeEach(() => {
  auth.staleHook = { data: null, isPending: false };
  auth.serverUser = null;
  auth.getSessionCalls = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("Web", () => {
  describe("Authentication", () => {
    it(
      qc(
        "web.auth.login-opens-workspace",
        "opens the workspace of the signed-in user instead of returning to the login page",
      ),
      async () => {
        const user = userEvent.setup();
        auth.serverUser = customer;
        installFakeApi(customerPanelRoutes([]));

        renderAppAt("/login");
        await user.type(screen.getByTestId("auth-email"), customer.email);
        await user.type(screen.getByTestId("auth-password"), "correct horse battery");
        await user.click(screen.getByTestId("auth-submit"));

        expect(await screen.findByTestId("customer-panel")).toBeVisible();
        expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
      },
    );

    it(
      qc(
        "web.auth.signed-out-visits-login",
        "sends a visitor without a session from a workspace to the login page",
      ),
      async () => {
        const api = installFakeApi(customerPanelRoutes([]));

        renderAppAt("/customer");

        expect(await screen.findByTestId("login-page")).toBeVisible();
        expect(screen.queryByTestId("customer-panel")).not.toBeInTheDocument();
        expect(api.calls).toEqual([]);
      },
    );
  });
});
