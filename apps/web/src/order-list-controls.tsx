import { useI18n } from "./i18n";

export type OrderFilterValues = {
  search: string;
  status: string;
  categoryId: string;
};

export const emptyOrderFilters: OrderFilterValues = {
  search: "",
  status: "",
  categoryId: "",
};

export const ORDERS_PAGE_SIZE = 10;

type FilterableOrder = {
  title: string;
  description: string;
  status: string;
  category: { id: string; name: string };
};

export function filterOrders<T extends FilterableOrder>(
  orders: T[],
  filters: OrderFilterValues,
  locale = "en",
): T[] {
  const search = filters.search.trim().toLocaleLowerCase(locale);
  return orders.filter((order) => {
    if (filters.status && order.status !== filters.status) return false;
    if (filters.categoryId && order.category.id !== filters.categoryId) return false;
    if (!search) return true;
    const text = `${order.title}\n${order.description}`.toLocaleLowerCase(locale);
    return text.includes(search);
  });
}

export function getOrderCategoryOptions<T extends FilterableOrder>(
  orders: T[],
  locale = "en",
): { id: string; name: string }[] {
  const categories = new Map<string, string>();
  for (const order of orders) categories.set(order.category.id, order.category.name);
  return [...categories]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, locale));
}

export function paginateOrders<T>(orders: T[], page: number) {
  const total = orders.length;
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * ORDERS_PAGE_SIZE;
  return {
    items: orders.slice(start, start + ORDERS_PAGE_SIZE),
    page: currentPage,
    total,
    totalPages,
  };
}

export function hasActiveOrderFilters(filters: OrderFilterValues): boolean {
  return Boolean(filters.search.trim() || filters.status || filters.categoryId);
}

export function OrderListControls({
  filters,
  categories,
  onChange,
  onReset,
  disabled = false,
}: {
  filters: OrderFilterValues;
  categories: { id: string; name: string }[];
  onChange: (filters: OrderFilterValues) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="order-list-controls" data-testid="order-filters">
      <label className="order-filter-field order-filter-search">
        <span>{t.orderFilters.search}</span>
        <input
          type="search"
          value={filters.search}
          maxLength={200}
          placeholder={t.orderFilters.searchPlaceholder}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          data-testid="order-search"
        />
      </label>
      <label className="order-filter-field">
        <span>{t.orderFilters.status}</span>
        <select
          value={filters.status}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, status: event.target.value })}
          data-testid="order-status-filter"
        >
          <option value="">{t.orderFilters.allStatuses}</option>
          {Object.entries(t.statuses).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="order-filter-field">
        <span>{t.orderFilters.category}</span>
        <select
          value={filters.categoryId}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, categoryId: event.target.value })}
          data-testid="order-category-filter"
        >
          <option value="">{t.orderFilters.allCategories}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      {hasActiveOrderFilters(filters) && (
        <button
          className="button button-quiet order-filters-reset"
          type="button"
          disabled={disabled}
          onClick={onReset}
          data-testid="order-filters-reset"
        >
          {t.orderFilters.reset}
        </button>
      )}
    </div>
  );
}

export function OrderPagination({
  page,
  total,
  totalPages,
  onPageChange,
  disabled = false,
}: {
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const { t, format } = useI18n();

  if (total === 0) return null;
  const first = (page - 1) * ORDERS_PAGE_SIZE + 1;
  const last = Math.min(page * ORDERS_PAGE_SIZE, total);
  return (
    <nav className="order-pagination" aria-label={t.pagination.aria} data-testid="orders-pagination">
      <button
        className="button button-quiet"
        type="button"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        data-testid="orders-prev-page"
      >
        {t.pagination.back}
      </button>
      <span data-testid="orders-page-summary">
        {format(t.common.pagination, { first, last, total, page, totalPages })}
      </span>
      <button
        className="button button-quiet"
        type="button"
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        data-testid="orders-next-page"
      >
        {t.pagination.next}
      </button>
    </nav>
  );
}
