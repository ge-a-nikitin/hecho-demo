// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { installFakeApi } from "./support/fake-api";
import { order } from "./support/fixtures";
import { renderAppAt } from "./support/render-app";

const { session } = vi.hoisted(() => ({
  session: {
    current: {
      data: {
        user: {
          id: "executor-1",
          name: "Grace Hopper",
          email: "grace@example.com",
          role: "EXECUTOR",
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

const poolOrder = order({ id: "order-1", status: "WAITING_DISTRIBUTION" });
const claimedOrder = order({
  id: "order-1",
  status: "ASSIGNED",
  executor: { id: "executor-1", name: "Grace Hopper" },
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("Web", () => {
  describe("Executor panel", () => {
    it(
      qc("web.executor-panel.claims-pool-order", "claims a pool order and moves it into the assigned group"),
      async () => {
        const user = userEvent.setup();
        const api = installFakeApi({
          // The panel reloads the list after a successful claim, so the second
          // answer is what the person sees: the order is no longer in the pool.
          "GET /orders": (_call, attempt) => ({
            body: [attempt === 1 ? poolOrder : claimedOrder],
          }),
          "POST /orders/order-1/claim": { body: {} },
        });

        renderAppAt("/executor");

        const pool = await screen.findByTestId("executor-order-pool");
        expect(within(pool).getByText("Kitchen tap replacement")).toBeVisible();

        await user.click(screen.getByTestId("claim-order-order-1"));

        const assigned = screen.getByTestId("executor-assigned-orders");
        expect(await within(assigned).findByText("Kitchen tap replacement")).toBeVisible();
        expect(within(screen.getByTestId("executor-order-pool")).queryByText("Kitchen tap replacement")).not.toBeInTheDocument();
        expect(api.calls).toEqual([
          "GET /orders",
          "POST /orders/order-1/claim",
          "GET /orders",
        ]);
      },
    );
  });
});
