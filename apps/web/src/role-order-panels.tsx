import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest, downloadApiFile, getUserFacingError } from "./api";
import { useToast } from "./toast";

type Category = { id: string; name: string };
type Executor = {
  id: string;
  name: string;
  email: string;
  hourlyRate: number | string | null;
  isActive: boolean;
};
type Estimate = {
  id: string;
  hours: number | string;
  amount: number | string;
  status: string;
};
type Invoice = {
  id: string;
  number: string;
  amount: number | string;
  status: string;
  paymentReports?: {
    id: string;
    filename: string;
    status: string;
    reviewComment: string | null;
    submittedAt: string;
  }[];
};
type WorkOrder = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: Category;
  createdAt: string;
  dueAt: string | null;
  location: string | null;
  customer: { id: string; name: string };
  executor: { id: string; name: string } | null;
  acceptedAt: string | null;
  estimates: Estimate[];
  invoices: Invoice[];
  timeEntry: { minutes: number; comment: string | null } | null;
};

const statusLabels: Record<string, string> = {
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

export function ExecutorOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [hoursByOrder, setHoursByOrder] = useState<Record<string, string>>({});
  const [minutesByOrder, setMinutesByOrder] = useState<Record<string, string>>({});
  const [timeCommentsByOrder, setTimeCommentsByOrder] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setOrders(await apiRequest<WorkOrder[]>("/orders"));
    } catch (error) {
      setLoadError(true);
      showToast(getUserFacingError(error, "Не удалось загрузить заказы."));
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function runOrderAction(order: WorkOrder, action: () => Promise<unknown>, success: string) {
    setBusyOrderId(order.id);
    try {
      await action();
      showToast(success, "success");
      await loadOrders();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось выполнить действие."));
    } finally {
      setBusyOrderId("");
    }
  }

  async function saveWorkTime(event: FormEvent<HTMLFormElement>, order: WorkOrder) {
    event.preventDefault();
    const minutes = Number(minutesByOrder[order.id] ?? order.timeEntry?.minutes ?? 0);
    const comment = (timeCommentsByOrder[order.id] ?? order.timeEntry?.comment ?? "").trim();
    await runOrderAction(
      order,
      () => apiRequest(`/orders/${encodeURIComponent(order.id)}/time`, {
        method: "POST",
        body: JSON.stringify({ minutes, ...(comment ? { comment } : {}) }),
      }),
      "Учёт времени сохранён.",
    );
  }

  const poolOrders = orders.filter((order) => order.status === "WAITING_DISTRIBUTION" && !order.executor);
  const assignedOrders = orders.filter((order) => order.executor !== null);

  return (
    <section className="customer-orders role-orders" aria-label="Заказы исполнителя" data-testid="executor-orders">
      <div className="orders-toolbar">
        <div><h2>Заказы</h2><p>Свободные задачи и ваша текущая работа</p></div>
        <button className="button button-quiet" type="button" onClick={() => void loadOrders()} disabled={isLoading} data-testid="executor-refresh">
          Обновить
        </button>
      </div>
      {loadError ? (
        <LoadError retry={() => void loadOrders()} testId="executor-orders-load-error" />
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="executor-orders-loading">Загружаем заказы…</div>
      ) : (
        <>
          <OrderGroup
            title="Свободные заказы"
            orders={poolOrders}
            emptyText="Сейчас нет свободных заказов."
            testId="executor-order-pool"
            panelPath="/executor"
            renderActions={(order) => (
              <button
                className="button button-primary"
                type="button"
                disabled={busyOrderId === order.id}
                onClick={() => void runOrderAction(
                  order,
                  () => apiRequest(`/orders/${encodeURIComponent(order.id)}/claim`, { method: "POST" }),
                  "Заказ назначен вам.",
                )}
                data-testid={`claim-order-${order.id}`}
              >
                {busyOrderId === order.id ? "Забираем…" : "Взять заказ"}
              </button>
            )}
          />
          <OrderGroup
            title="Назначенные заказы"
            orders={assignedOrders}
            emptyText="У вас пока нет назначенных заказов."
            testId="executor-assigned-orders"
            panelPath="/executor"
            renderActions={(order) => {
              const isBusy = busyOrderId === order.id;
              const hasPendingEstimate = order.estimates.some((estimate) => estimate.status === "PENDING");
              return (
                <div className="role-order-actions">
                  {order.status === "ASSIGNED" && !hasPendingEstimate && (
                    <form
                      className="inline-action-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const hours = Number(hoursByOrder[order.id]);
                        void runOrderAction(
                          order,
                          () => apiRequest(`/orders/${encodeURIComponent(order.id)}/estimate`, {
                            method: "POST",
                            body: JSON.stringify({ hours }),
                          }),
                          "Оценка отправлена заказчику.",
                        );
                      }}
                    >
                      <label>
                        Оценка, часов
                        <input
                          type="number"
                          min="0.0001"
                          max="100000"
                          step="0.0001"
                          required
                          value={hoursByOrder[order.id] ?? ""}
                          onChange={(event) => setHoursByOrder((values) => ({ ...values, [order.id]: event.target.value }))}
                          data-testid={`estimate-hours-${order.id}`}
                        />
                      </label>
                      <button className="button button-primary" type="submit" disabled={isBusy} data-testid={`submit-estimate-${order.id}`}>
                        Предложить оценку
                      </button>
                    </form>
                  )}
                  {order.status === "ASSIGNED" && (
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void runOrderAction(
                        order,
                        () => apiRequest(`/orders/${encodeURIComponent(order.id)}/decline`, {
                          method: "POST",
                          body: JSON.stringify({}),
                        }),
                        "Заказ возвращён в общий пул.",
                      )}
                      data-testid={`decline-order-${order.id}`}
                    >
                      Отказаться от заказа
                    </button>
                  )}
                  {hasPendingEstimate && <p className="form-hint">Оценка ожидает ответа заказчика.</p>}
                  {(order.status === "IN_PROGRESS") && (
                    <>
                      <form className="inline-action-form" onSubmit={(event) => void saveWorkTime(event, order)}>
                        <label>
                          Время, минут
                          <input
                            type="number"
                            min="0"
                            max="1000000"
                            step="1"
                            required
                            value={minutesByOrder[order.id] ?? String(order.timeEntry?.minutes ?? 0)}
                            onChange={(event) => setMinutesByOrder((values) => ({ ...values, [order.id]: event.target.value }))}
                            data-testid={`work-time-${order.id}`}
                          />
                        </label>
                        <label>
                          Комментарий
                          <input
                            type="text"
                            maxLength={2000}
                            value={timeCommentsByOrder[order.id] ?? order.timeEntry?.comment ?? ""}
                            onChange={(event) => setTimeCommentsByOrder((values) => ({ ...values, [order.id]: event.target.value }))}
                            data-testid={`work-time-comment-${order.id}`}
                          />
                        </label>
                        <button className="button button-quiet" type="submit" disabled={isBusy} data-testid={`save-work-time-${order.id}`}>
                          Сохранить время
                        </button>
                      </form>
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runOrderAction(
                          order,
                          () => apiRequest(`/orders/${encodeURIComponent(order.id)}/submit-review`, { method: "POST" }),
                          "Работа отправлена заказчику на проверку.",
                        )}
                        data-testid={`submit-review-${order.id}`}
                      >
                        Отправить на проверку
                      </button>
                    </>
                  )}
                  {order.status === "NEEDS_REVISION" && (
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void runOrderAction(
                        order,
                        () => apiRequest(`/orders/${encodeURIComponent(order.id)}/resume-revisions`, { method: "POST" }),
                        "Работа над исправлениями начата.",
                      )}
                      data-testid={`resume-revisions-${order.id}`}
                    >
                      Начать исправления
                    </button>
                  )}
                  {order.timeEntry && <p className="form-hint">Учтено: {order.timeEntry.minutes} мин.</p>}
                  {order.estimates.length > 0 && (
                    <p className="form-hint">
                      Последняя оценка: {formatAmount(order.estimates[0].amount)} · {estimateStatus(order.estimates[0].status)}
                    </p>
                  )}
                </div>
              );
            }}
          />
        </>
      )}
    </section>
  );
}

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [selectedExecutors, setSelectedExecutors] = useState<Record<string, string>>({});
  const [paymentReviewReasons, setPaymentReviewReasons] = useState<Record<string, string>>({});
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [nextOrders, nextExecutors] = await Promise.all([
        apiRequest<WorkOrder[]>("/orders"),
        apiRequest<Executor[]>("/users/executors"),
      ]);
      setOrders(nextOrders);
      setExecutors(nextExecutors);
    } catch (error) {
      setLoadError(true);
      showToast(getUserFacingError(error, "Не удалось загрузить данные панели."));
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runOrderAction(order: WorkOrder, action: () => Promise<unknown>, success: string) {
    setBusyOrderId(order.id);
    try {
      await action();
      showToast(success, "success");
      await loadData();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось выполнить действие."));
    } finally {
      setBusyOrderId("");
    }
  }

  return (
    <section className="customer-orders role-orders" aria-label="Управление заказами" data-testid="admin-orders">
      <div className="orders-toolbar">
        <div><h2>Все заказы</h2><p>Назначайте исполнителей и контролируйте оплату</p></div>
        <button className="button button-quiet" type="button" onClick={() => void loadData()} disabled={isLoading} data-testid="admin-refresh">
          Обновить
        </button>
      </div>

      {loadError ? (
        <LoadError retry={() => void loadData()} testId="admin-orders-load-error" />
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="admin-orders-loading">Загружаем данные…</div>
      ) : orders.length === 0 ? (
        <div className="empty-state orders-empty" data-testid="admin-orders-empty">
          <span className="empty-state-icon" aria-hidden="true">✳</span>
          <h2>Заказов пока нет</h2>
          <p>Новые заказы появятся здесь после отправки заказчиком.</p>
        </div>
      ) : (
        <div className="orders-list" data-testid="admin-orders-list">
          {orders.map((order) => {
            const issuedInvoice = order.invoices.find((invoice) => invoice.status === "ISSUED");
            const latestPaymentReport = issuedInvoice?.paymentReports?.[0];
            const pendingPaymentReport = latestPaymentReport?.status === "PENDING" ? latestPaymentReport : undefined;
            const canIssueInvoice =
              (order.status === "ON_REVIEW" && Boolean(order.acceptedAt)) ||
              (order.status === "INVOICE_ISSUED" && order.invoices.length > 0 && order.invoices.every((invoice) => invoice.status === "VOID"));
            const canAssign = order.status === "WAITING_DISTRIBUTION" || order.status === "ASSIGNED";
            const isBusy = busyOrderId === order.id;
            return (
              <OrderCard
                key={order.id}
                order={order}
                testId={`admin-order-${order.id}`}
                panelPath="/admin"
                renderActions={() => (
                  <div className="role-order-actions">
                    {canAssign && (
                      <form
                        className="inline-action-form assign-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const executorId = selectedExecutors[order.id];
                          if (!executorId) return;
                          void runOrderAction(
                            order,
                            () => apiRequest(`/orders/${encodeURIComponent(order.id)}/assign`, {
                              method: "POST",
                              body: JSON.stringify({ executorId }),
                            }),
                            "Исполнитель назначен.",
                          );
                        }}
                      >
                        <label>
                          {order.executor ? `Назначен: ${order.executor.name}` : "Назначить исполнителя"}
                          <select
                            value={selectedExecutors[order.id] ?? ""}
                            required
                            disabled={executors.length === 0}
                            onChange={(event) => setSelectedExecutors((values) => ({ ...values, [order.id]: event.target.value }))}
                            data-testid={`assign-executor-${order.id}`}
                          >
                            <option value="" disabled>Выберите исполнителя</option>
                            {executors.map((executor) => (
                              <option key={executor.id} value={executor.id} disabled={executor.id === order.executor?.id}>
                                {executor.name} · {formatAmount(executor.hourlyRate ?? 0)}/ч
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="button button-quiet" type="submit" disabled={isBusy || executors.length === 0} data-testid={`submit-assignment-${order.id}`}>
                          {order.executor ? "Переназначить" : "Назначить"}
                        </button>
                      </form>
                    )}
                    {canIssueInvoice && (
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runOrderAction(
                          order,
                          () => apiRequest(`/orders/${encodeURIComponent(order.id)}/invoices`, { method: "POST" }),
                          "Счёт выставлен.",
                        )}
                        data-testid={`issue-invoice-${order.id}`}
                      >
                        Выставить счёт
                      </button>
                    )}
                    {order.invoices.length > 0 && (
                      <div className="invoice-admin-actions">
                        {order.invoices.map((invoice) => (
                          <div key={invoice.id} className="invoice-admin-action">
                            <button
                              className="text-link"
                              type="button"
                              onClick={() => void downloadApiFile(
                                `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(invoice.id)}/pdf`,
                                `${invoice.number}.pdf`,
                              ).catch((error: unknown) => showToast(getUserFacingError(error, "Не удалось скачать PDF счёта.")))}
                              data-testid={`download-invoice-pdf-${invoice.id}`}
                            >
                              PDF счёта {invoice.number}
                            </button>
                            {invoice.status === "ISSUED" && !pendingPaymentReport && (
                              <form
                                className="inline-action-form"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const reason = voidReasons[invoice.id]?.trim();
                                  if (!reason) return;
                                  void runOrderAction(
                                    order,
                                    () => apiRequest(
                                      `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(invoice.id)}/void`,
                                      { method: "POST", body: JSON.stringify({ reason }) },
                                    ),
                                    "Счёт аннулирован. Можно выставить новый.",
                                  );
                                }}
                              >
                                <label>
                                  Причина аннулирования счёта {invoice.number}
                                  <input
                                    required
                                    maxLength={2000}
                                    value={voidReasons[invoice.id] ?? ""}
                                    onChange={(event) => setVoidReasons((values) => ({ ...values, [invoice.id]: event.target.value }))}
                                    data-testid={`void-invoice-reason-${invoice.id}`}
                                  />
                                </label>
                                <button
                                  className="button button-quiet"
                                  type="submit"
                                  disabled={isBusy || !voidReasons[invoice.id]?.trim()}
                                  data-testid={`void-invoice-${invoice.id}`}
                                >
                                  Аннулировать счёт
                                </button>
                              </form>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {order.status === "INVOICE_PAID" && (
                      <div className="payment-review" data-testid={`complete-order-section-${order.id}`}>
                        <p className="form-hint">Оплата подтверждена. Завершите заказ после проверки поступления денег.</p>
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={isBusy}
                          onClick={() => void runOrderAction(
                            order,
                            () => apiRequest(`/orders/${encodeURIComponent(order.id)}/complete`, { method: "POST" }),
                            "Заказ завершён.",
                          )}
                          data-testid={`complete-order-${order.id}`}
                        >
                          Завершить заказ
                        </button>
                      </div>
                    )}
                    {issuedInvoice && (
                      <div className="payment-review" data-testid={`payment-review-${order.id}`}>
                        {pendingPaymentReport ? (
                          <>
                            <p className="form-hint">Заказчик сообщил об оплате. Проверьте поступление денег и чек.</p>
                            <button
                              className="text-link"
                              type="button"
                              onClick={() => void downloadApiFile(
                                `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(issuedInvoice.id)}/payment-reports/${encodeURIComponent(pendingPaymentReport.id)}/file`,
                                pendingPaymentReport.filename,
                              ).catch((error: unknown) => showToast(getUserFacingError(error, "Не удалось скачать чек.")))}
                              data-testid={`download-payment-receipt-${order.id}`}
                            >
                              Скачать чек: {pendingPaymentReport.filename}
                            </button>
                            <button
                              className="button button-primary"
                              type="button"
                              disabled={isBusy}
                              onClick={() => void runOrderAction(
                                order,
                                () => apiRequest(
                                  `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(issuedInvoice.id)}/payment-reports/${encodeURIComponent(pendingPaymentReport.id)}/confirm`,
                                  { method: "POST" },
                                ),
                                "Оплата подтверждена. Заказ перешёл в статус «Счёт оплачен».",
                              )}
                              data-testid={`confirm-payment-${order.id}`}
                            >
                              Подтвердить оплату
                            </button>
                            <form
                              className="inline-action-form"
                              onSubmit={(event) => {
                                event.preventDefault();
                                const reason = paymentReviewReasons[order.id]?.trim();
                                if (!reason) return;
                                void runOrderAction(
                                  order,
                                  () => apiRequest(
                                    `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(issuedInvoice.id)}/payment-reports/${encodeURIComponent(pendingPaymentReport.id)}/reject`,
                                    { method: "POST", body: JSON.stringify({ reason }) },
                                  ),
                                  "Подтверждение оплаты отклонено. Заказчик сможет отправить чек повторно.",
                                );
                              }}
                            >
                              <label>
                                Причина отклонения чека
                                <input
                                  required
                                  maxLength={2000}
                                  value={paymentReviewReasons[order.id] ?? ""}
                                  onChange={(event) => setPaymentReviewReasons((values) => ({ ...values, [order.id]: event.target.value }))}
                                  data-testid={`reject-payment-reason-${order.id}`}
                                />
                              </label>
                              <button className="button button-quiet" type="submit" disabled={isBusy} data-testid={`reject-payment-${order.id}`}>
                                Отклонить чек
                              </button>
                            </form>
                          </>
                        ) : latestPaymentReport?.status === "REJECTED" ? (
                          <>
                            <button
                              className="text-link"
                              type="button"
                              onClick={() => void downloadApiFile(
                                `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(issuedInvoice.id)}/payment-reports/${encodeURIComponent(latestPaymentReport.id)}/file`,
                                latestPaymentReport.filename,
                              ).catch((error: unknown) => showToast(getUserFacingError(error, "Не удалось скачать чек.")))}
                              data-testid={`download-rejected-payment-receipt-${order.id}`}
                            >
                              Чек: {latestPaymentReport.filename}
                            </button>
                            <p className="form-hint">Последний чек отклонён: {latestPaymentReport.reviewComment}</p>
                          </>
                        ) : (
                          <p className="form-hint">Ожидается оплата заказчиком и чек.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function OrderGroup({
  title,
  orders,
  emptyText,
  testId,
  panelPath,
  renderActions,
}: {
  title: string;
  orders: WorkOrder[];
  emptyText: string;
  testId: string;
  panelPath: string;
  renderActions: (order: WorkOrder) => React.ReactNode;
}) {
  return (
    <section className="order-group" aria-label={title} data-testid={testId}>
      <h3>{title} <span>({orders.length})</span></h3>
      {orders.length === 0 ? <p className="order-group-empty">{emptyText}</p> : (
        <div className="orders-list">
          {orders.map((order) => <OrderCard key={order.id} order={order} panelPath={panelPath} renderActions={() => renderActions(order)} />)}
        </div>
      )}
    </section>
  );
}

function OrderCard({
  order,
  renderActions,
  panelPath,
  testId,
}: {
  order: WorkOrder;
  renderActions: () => React.ReactNode;
  panelPath: string;
  testId?: string;
}) {
  const pendingEstimate = order.estimates.find((estimate) => estimate.status === "PENDING");
  return (
    <article className="order-list-card role-order-card" data-testid={testId}>
      <div className="order-list-main">
        <div className="order-list-meta">
          <span>{order.category.name}</span>
          <span className={`order-status order-status-${order.status.toLowerCase()}`}>{statusLabels[order.status] ?? order.status}</span>
        </div>
        <h3>{order.title}</h3>
        <p>{order.description}</p>
        <div className="order-list-footer">
          <span>Заказчик: {order.customer.name}</span>
          {order.executor && <span>Исполнитель: {order.executor.name}</span>}
          <span>Создан {formatDate(order.createdAt)}</span>
          {order.dueAt && <span>Срок {formatDate(order.dueAt)}</span>}
          {order.location && <span>{order.location}</span>}
        </div>
        <Link className="order-detail-link" to={`${panelPath}/orders/${encodeURIComponent(order.id)}`} data-testid={`open-order-${order.id}`}>
          Открыть карточку заказа <span aria-hidden="true">↗</span>
        </Link>
        {pendingEstimate && <p className="form-hint">Оценка ожидает ответа: {formatAmount(pendingEstimate.amount)}</p>}
        {order.invoices.map((invoice) => (
          <p className="form-hint" key={invoice.id}>
            Счёт {invoice.number}: {formatAmount(invoice.amount)} · {invoiceStatus(invoice.status)}
          </p>
        ))}
      </div>
      <div className="role-order-actions-container">{renderActions()}</div>
    </article>
  );
}

function LoadError({ retry, testId }: { retry: () => void; testId: string }) {
  return (
    <div className="api-load-error" role="group" data-testid={testId}>
      <button className="button button-quiet" type="button" onClick={retry}>Повторить загрузку</button>
    </div>
  );
}

function formatAmount(value: number | string): string {
  const amount = Number(value);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function estimateStatus(status: string): string {
  if (status === "PENDING") return "ожидает ответа";
  if (status === "ACCEPTED") return "принята";
  if (status === "REJECTED") return "отклонена";
  return status;
}

function invoiceStatus(status: string): string {
  if (status === "ISSUED") return "выставлен";
  if (status === "PAID") return "оплачен";
  if (status === "VOID") return "аннулирован";
  return status;
}
