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

export const orderStatusLabels: Record<string, string> = {
  NEW: "Черновик",
  WAITING_DISTRIBUTION: "Ждёт распределения",
  ASSIGNED: "Назначена",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  NEEDS_REVISION: "Нужны исправления",
  INVOICE_ISSUED: "Выставлен счёт",
  INVOICE_PAID: "Счёт оплачен",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
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
): T[] {
  const search = filters.search.trim().toLocaleLowerCase("ru");
  return orders.filter((order) => {
    if (filters.status && order.status !== filters.status) return false;
    if (filters.categoryId && order.category.id !== filters.categoryId) return false;
    if (!search) return true;
    const text = `${order.title}\n${order.description}`.toLocaleLowerCase("ru");
    return text.includes(search);
  });
}

export function getOrderCategoryOptions<T extends FilterableOrder>(
  orders: T[],
): { id: string; name: string }[] {
  const categories = new Map<string, string>();
  for (const order of orders) categories.set(order.category.id, order.category.name);
  return [...categories]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
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
  return (
    <div className="order-list-controls" data-testid="order-filters">
      <label className="order-filter-field order-filter-search">
        <span>Поиск</span>
        <input
          type="search"
          value={filters.search}
          maxLength={200}
          placeholder="Название или описание"
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          data-testid="order-search"
        />
      </label>
      <label className="order-filter-field">
        <span>Статус</span>
        <select
          value={filters.status}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, status: event.target.value })}
          data-testid="order-status-filter"
        >
          <option value="">Все статусы</option>
          {Object.entries(orderStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="order-filter-field">
        <span>Категория</span>
        <select
          value={filters.categoryId}
          disabled={disabled}
          onChange={(event) => onChange({ ...filters, categoryId: event.target.value })}
          data-testid="order-category-filter"
        >
          <option value="">Все категории</option>
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
          Сбросить фильтры
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
  if (total === 0) return null;
  const first = (page - 1) * ORDERS_PAGE_SIZE + 1;
  const last = Math.min(page * ORDERS_PAGE_SIZE, total);
  return (
    <nav className="order-pagination" aria-label="Страницы заказов" data-testid="orders-pagination">
      <button
        className="button button-quiet"
        type="button"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        data-testid="orders-prev-page"
      >
        Назад
      </button>
      <span data-testid="orders-page-summary">
        Показано {first}–{last} из {total} · страница {page} из {totalPages}
      </span>
      <button
        className="button button-quiet"
        type="button"
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        data-testid="orders-next-page"
      >
        Вперёд
      </button>
    </nav>
  );
}
