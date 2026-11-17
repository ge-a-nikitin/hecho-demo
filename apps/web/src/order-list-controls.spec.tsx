// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../api/src/test-support/qase-case";
import { I18nProvider } from "./i18n";
import { emptyOrderFilters, OrderListControls, type OrderFilterValues } from "./order-list-controls";

afterEach(cleanup);

function renderControls(
  filters: OrderFilterValues,
  onChange = vi.fn(),
  onReset = vi.fn(),
) {
  render(
    <I18nProvider>
      <OrderListControls
        filters={filters}
        categories={[
          { id: "plumbing", name: "Plumbing" },
          { id: "electrics", name: "Electrics" },
        ]}
        onChange={onChange}
        onReset={onReset}
      />
    </I18nProvider>,
  );

  return { onChange, onReset };
}

describe("Web", () => {
  describe("Orders list", () => {
    it(
      qc("web.orders.controls-reset", "shows the reset action only while a filter is active"),
      () => {
        renderControls(emptyOrderFilters);

        expect(screen.getByTestId("order-search")).toBeVisible();
        expect(screen.getByTestId("order-status-filter")).toBeVisible();
        expect(screen.getByTestId("order-category-filter")).toBeVisible();
        expect(screen.queryByTestId("order-filters-reset")).toBeNull();
        expect(screen.queryByRole("option", { name: "Plumbing" })).not.toBeNull();

        cleanup();

        const onChange = vi.fn();
        renderControls({ ...emptyOrderFilters, status: "ASSIGNED" }, onChange);

        const reset = screen.getByTestId("order-filters-reset");

        expect(reset).toBeVisible();
        fireEvent.click(reset);

        cleanup();

        const { onChange: onStatusChange } = renderControls(emptyOrderFilters);

        fireEvent.change(screen.getByTestId("order-status-filter"), { target: { value: "IN_PROGRESS" } });

        expect(onStatusChange).toHaveBeenCalledWith({ ...emptyOrderFilters, status: "IN_PROGRESS" });

        cleanup();

        renderControls({ ...emptyOrderFilters, search: " " });

        expect(screen.queryByTestId("order-filters-reset")).toBeNull();
      },
    );
  });
});
