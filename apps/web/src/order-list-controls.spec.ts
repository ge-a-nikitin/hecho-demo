import { describe, expect, it } from "vitest";
import { qc } from "../../api/src/test-support/qase-case";
import {
  ORDERS_PAGE_SIZE,
  emptyOrderFilters,
  filterOrders,
  getOrderCategoryOptions,
  paginateOrders,
  type OrderFilterValues,
} from "./order-list-controls";

type TestOrder = {
  title: string;
  description: string;
  status: string;
  category: { id: string; name: string };
};

function order(
  title: string,
  status: string,
  category: { id: string; name: string },
  description = "",
): TestOrder {
  return { title, description, status, category };
}

const plumbing = { id: "plumbing", name: "Plumbing" };
const electrics = { id: "electrics", name: "Electrics" };

const orders: TestOrder[] = [
  order("Замена смесителя", "NEW", plumbing, "Протекает кран на кухне"),
  order("Fix the socket", "IN_PROGRESS", electrics, "The kitchen socket sparks"),
  order("Boiler service", "COMPLETED", plumbing, "Yearly maintenance"),
];

function filters(patch: Partial<OrderFilterValues> = {}): OrderFilterValues {
  return { ...emptyOrderFilters, ...patch };
}

describe("Web", () => {
  describe("Orders list", () => {
    it(
      qc("web.orders.filter-orders", "narrows the list by status, category and a case-insensitive search"),
      () => {
        expect(filterOrders(orders, filters({ status: "IN_PROGRESS" }))).toEqual([orders[1]]);
        expect(filterOrders(orders, filters())).toEqual(orders);

        expect(filterOrders(orders, filters({ categoryId: "plumbing" }))).toEqual([orders[0], orders[2]]);

        expect(filterOrders(orders, filters({ search: "  ЗАМЕНА  " }))).toEqual([orders[0]]);
        expect(filterOrders(orders, filters({ search: "socket" }))).toEqual([orders[1]]);
        expect(filterOrders(orders, filters({ search: "kitchen" }))).toEqual([orders[1]]);

        expect(
          filterOrders(orders, filters({ status: "COMPLETED", categoryId: "electrics", search: "socket" })),
        ).toEqual([]);
      },
    );

    it(
      qc("web.orders.category-options", "lists every category once, sorted by the locale of the interface"),
      () => {
        expect(getOrderCategoryOptions(orders)).toEqual([electrics, plumbing]);

        const cyrillic = [
          order("Яблоко", "NEW", { id: "fruit", name: "яблоко" }),
          order("Ёлка", "NEW", { id: "tree", name: "ёлка" }),
        ];

        expect(getOrderCategoryOptions(cyrillic, "ru")).toEqual([
          { id: "tree", name: "ёлка" },
          { id: "fruit", name: "яблоко" },
        ]);
      },
    );

    it(
      qc("web.orders.pagination", "clamps the requested page to the range the list actually has"),
      () => {
        const many = Array.from({ length: 25 }, (_, index) =>
          order(`Order ${index + 1}`, "NEW", plumbing),
        );

        const first = paginateOrders(many, 1);

        expect(first.items).toHaveLength(ORDERS_PAGE_SIZE);
        expect(first).toMatchObject({ page: 1, total: 25, totalPages: 3 });

        expect(paginateOrders(many, 2).items[0]).toEqual(many[ORDERS_PAGE_SIZE]);
        expect(paginateOrders(many, 0).page).toBe(1);
        expect(paginateOrders(many, 0).items).toEqual(first.items);
        expect(paginateOrders(many, 99)).toMatchObject({ page: 3, totalPages: 3 });
        expect(paginateOrders(many, 99).items).toEqual(many.slice(20));

        expect(paginateOrders([], 1)).toEqual({ items: [], page: 1, total: 0, totalPages: 1 });
      },
    );
  });
});
