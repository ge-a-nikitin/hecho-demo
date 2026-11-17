// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { messagesByLanguage } from "../../src/i18n";
import { installFakeApi } from "./support/fake-api";
import { customerPanelRoutes, order } from "./support/fixtures";
import { renderAppAt } from "./support/render-app";

// `auth-client` builds its instance at import time against Better Auth, so the
// spec replaces the whole module: a panel case needs a session, not a server.
const { session } = vi.hoisted(() => ({
  session: {
    current: {
      data: {
        user: {
          id: "customer-1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          role: "CUSTOMER",
        },
      },
      isPending: false,
    } as { data: { user: Record<string, string> } | null; isPending: boolean },
  },
}));

vi.mock("../../src/auth-client", () => ({
  authClient: {
    useSession: () => session.current,
    signOut: async () => ({ data: null, error: null }),
  },
}));

const tapOrder = order({ id: "order-1" });
const leakOrder = order({
  id: "order-2",
  title: "Bathroom leak repair",
  description: "Water under the sink after every shower.",
  status: "ASSIGNED",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("Web", () => {
  describe("Orders page", () => {
    it(
      qc("web.orders-page.loads-orders", "renders the orders the api returns and drops the loading state"),
      async () => {
        installFakeApi(customerPanelRoutes([tapOrder, leakOrder]));

        renderAppAt("/customer");

        expect(screen.getByTestId("orders-loading")).toBeVisible();

        expect(await screen.findByTestId("order-card-order-1")).toBeVisible();
        expect(screen.getByTestId("order-card-order-2")).toBeVisible();
        expect(screen.getByText("Bathroom leak repair")).toBeVisible();
        expect(screen.queryByTestId("orders-loading")).not.toBeInTheDocument();
        expect(screen.queryByTestId("orders-empty-state")).not.toBeInTheDocument();
      },
    );

    it(
      qc("web.orders-page.search-narrows-list", "narrows the rendered list to the typed search and restores it with the reset action"),
      async () => {
        const user = userEvent.setup();
        installFakeApi(customerPanelRoutes([tapOrder, leakOrder]));

        renderAppAt("/customer");
        await screen.findByTestId("order-card-order-1");

        await user.type(screen.getByTestId("order-search"), "bathroom");

        expect(screen.queryByTestId("order-card-order-1")).not.toBeInTheDocument();
        expect(screen.getByTestId("order-card-order-2")).toBeVisible();

        await user.clear(screen.getByTestId("order-search"));
        await user.type(screen.getByTestId("order-search"), "no order matches this");

        expect(screen.getByTestId("orders-no-results")).toBeVisible();

        await user.click(screen.getByTestId("orders-reset-filters"));

        expect(screen.getByTestId("order-card-order-1")).toBeVisible();
        expect(screen.getByTestId("order-card-order-2")).toBeVisible();
        expect(screen.queryByTestId("orders-no-results")).not.toBeInTheDocument();
      },
    );

    it(
      qc("web.orders-page.retry-after-failure", "offers a retry that recovers from a failed load without a reload"),
      async () => {
        const user = userEvent.setup();
        const api = installFakeApi({
          ...customerPanelRoutes([tapOrder, leakOrder]),
          "GET /orders": (_call, attempt) =>
            attempt === 1
              ? { status: 503, body: { message: "Orders are unavailable" } }
              : { body: [tapOrder, leakOrder] },
        });

        renderAppAt("/customer");

        expect(await screen.findByTestId("orders-load-error")).toBeVisible();
        // A status the app knows is reported in the reader's language, so the
        // panel shows a sentence instead of an empty account.
        expect(
          await screen.findByText(messagesByLanguage.en.errors.SERVICE_UNAVAILABLE),
        ).toBeVisible();
        expect(screen.queryByTestId("order-card-order-1")).not.toBeInTheDocument();

        await user.click(screen.getByTestId("retry-orders"));

        expect(await screen.findByTestId("order-card-order-1")).toBeVisible();
        expect(screen.queryByTestId("orders-load-error")).not.toBeInTheDocument();
        expect(api.count("GET /orders")).toBe(2);
      },
    );
  });
});
