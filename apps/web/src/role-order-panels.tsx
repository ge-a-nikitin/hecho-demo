import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest, downloadApiFile } from "./api";
import {
  OrderListControls,
  OrderPagination,
  emptyOrderFilters,
  filterOrders,
  getOrderCategoryOptions,
  paginateOrders,
  type OrderFilterValues,
} from "./order-list-controls";
import { useToast } from "./toast";
import { useI18n } from "./i18n";

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

export function ExecutorOrdersPage() {
  const { t, locale, format, formatAmount, errorMessage, estimateStatusLabel } = useI18n();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [hoursByOrder, setHoursByOrder] = useState<Record<string, string>>({});
  const [minutesByOrder, setMinutesByOrder] = useState<Record<string, string>>({});
  const [timeCommentsByOrder, setTimeCommentsByOrder] = useState<Record<string, string>>({});
  const [orderFilters, setOrderFilters] = useState<OrderFilterValues>(emptyOrderFilters);
  const [ordersPage, setOrdersPage] = useState(1);
  const { showToast } = useToast();

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setOrders(await apiRequest<WorkOrder[]>("/orders"));
    } catch (error) {
      setLoadError(true);
      showToast(errorMessage(error, t.executor.errorLoad));
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
      showToast(errorMessage(error, t.executor.errorAction));
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
      t.toasts.timeSaved,
    );
  }

  const filteredOrders = filterOrders(orders, orderFilters, locale);
  const orderCategories = getOrderCategoryOptions(orders, locale);
  const { items: visibleOrders, page: currentPage, totalPages } = paginateOrders(
    filteredOrders,
    ordersPage,
  );
  const poolOrders = visibleOrders.filter((order) => order.status === "WAITING_DISTRIBUTION" && !order.executor);
  const assignedOrders = visibleOrders.filter((order) => order.executor !== null);

  function updateOrderFilters(next: OrderFilterValues) {
    setOrderFilters(next);
    setOrdersPage(1);
  }

  function resetOrderFilters() {
    setOrderFilters(emptyOrderFilters);
    setOrdersPage(1);
  }

  return (
    <section className="customer-orders role-orders" aria-label={t.executor.aria} data-testid="executor-orders">
      <div className="orders-toolbar">
        <div><h2>{t.executor.title}</h2><p>{t.executor.description}</p></div>
        <button className="button button-quiet" type="button" onClick={() => void loadOrders()} disabled={isLoading} data-testid="executor-refresh">
          {t.common.refresh}
        </button>
      </div>
      {loadError ? (
        <LoadError retry={() => void loadOrders()} testId="executor-orders-load-error" />
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="executor-orders-loading">{t.customer.loadingOrders}</div>
      ) : (
        <>
          {orders.length > 0 && (
            <OrderListControls
              filters={orderFilters}
              categories={orderCategories}
              onChange={updateOrderFilters}
              onReset={resetOrderFilters}
            />
          )}
          {orders.length > 0 && filteredOrders.length === 0 ? (
            <div className="empty-state orders-empty" data-testid="executor-orders-no-results">
              <span className="empty-state-icon" aria-hidden="true">⌕</span>
              <h2>{t.common.nothingFound}</h2>
              <p>{t.common.changeSearch}</p>
              <button
                className="button button-quiet"
                type="button"
                onClick={resetOrderFilters}
                data-testid="executor-orders-reset-filters"
              >
                {t.common.resetFilters}
              </button>
            </div>
          ) : (
            <>
              <OrderGroup
                title={t.executor.poolTitle}
            orders={poolOrders}
            emptyText={t.executor.poolEmpty}
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
                  t.toasts.orderClaimed,
                )}
                data-testid={`claim-order-${order.id}`}
              >
                {busyOrderId === order.id ? t.executor.fetching : t.executor.claimOrder}
              </button>
            )}
          />
          <OrderGroup
            title={t.executor.assignedTitle}
            orders={assignedOrders}
            emptyText={t.executor.assignedEmpty}
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
                          t.toasts.estimateSent,
                        );
                      }}
                    >
                      <label>
                        {t.executor.estimateHours}
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
                        {t.executor.proposeEstimate}
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
                        t.toasts.orderReturnedToPool,
                      )}
                      data-testid={`decline-order-${order.id}`}
                    >
                      {t.executor.declineOrder}
                    </button>
                  )}
                  {hasPendingEstimate && <p className="form-hint">{t.executor.estimatePending}</p>}
                  {(order.status === "IN_PROGRESS") && (
                    <>
                      <form className="inline-action-form" onSubmit={(event) => void saveWorkTime(event, order)}>
                        <label>
                          {t.executor.timeMinutes}
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
                          {t.executor.timeComment}
                          <input
                            type="text"
                            maxLength={2000}
                            value={timeCommentsByOrder[order.id] ?? order.timeEntry?.comment ?? ""}
                            onChange={(event) => setTimeCommentsByOrder((values) => ({ ...values, [order.id]: event.target.value }))}
                            data-testid={`work-time-comment-${order.id}`}
                          />
                        </label>
                        <button className="button button-quiet" type="submit" disabled={isBusy} data-testid={`save-work-time-${order.id}`}>
                          {t.executor.saveTime}
                        </button>
                      </form>
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runOrderAction(
                          order,
                          () => apiRequest(`/orders/${encodeURIComponent(order.id)}/submit-review`, { method: "POST" }),
                          t.toasts.workSubmitted,
                        )}
                        data-testid={`submit-review-${order.id}`}
                      >
                        {t.executor.submitReview}
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
                        t.toasts.revisionsStarted,
                      )}
                      data-testid={`resume-revisions-${order.id}`}
                    >
                      {t.executor.startRevisions}
                    </button>
                  )}
                  {order.timeEntry && <p className="form-hint">{format(t.executor.timeTracked, { minutes: order.timeEntry.minutes })}</p>}
                  {order.estimates.length > 0 && (
                    <p className="form-hint">
                      {format(t.executor.lastEstimate, {
                        amount: formatAmount(order.estimates[0].amount),
                        status: estimateStatusLabel(order.estimates[0].status),
                      })}
                    </p>
                  )}
                </div>
              );
            }}
          />
            </>
          )}
          {filteredOrders.length > 0 && (
            <OrderPagination
              page={currentPage}
              total={filteredOrders.length}
              totalPages={totalPages}
              onPageChange={setOrdersPage}
            />
          )}
        </>
      )}
    </section>
  );
}

export function AdminOrdersPage() {
  const { t, locale, format, formatAmount, errorMessage } = useI18n();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [selectedExecutors, setSelectedExecutors] = useState<Record<string, string>>({});
  const [paymentReviewReasons, setPaymentReviewReasons] = useState<Record<string, string>>({});
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});
  const [orderFilters, setOrderFilters] = useState<OrderFilterValues>(emptyOrderFilters);
  const [ordersPage, setOrdersPage] = useState(1);
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
      showToast(errorMessage(error, t.adminOrders.errorLoad));
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
      showToast(errorMessage(error, t.adminOrders.errorAction));
    } finally {
      setBusyOrderId("");
    }
  }

  const filteredOrders = filterOrders(orders, orderFilters, locale);
  const orderCategories = getOrderCategoryOptions(orders, locale);
  const { items: visibleOrders, page: currentPage, totalPages } = paginateOrders(
    filteredOrders,
    ordersPage,
  );

  function updateOrderFilters(next: OrderFilterValues) {
    setOrderFilters(next);
    setOrdersPage(1);
  }

  function resetOrderFilters() {
    setOrderFilters(emptyOrderFilters);
    setOrdersPage(1);
  }

  return (
    <section className="customer-orders role-orders" aria-label={t.adminOrders.aria} data-testid="admin-orders">
      <div className="orders-toolbar">
        <div><h2>{t.adminOrders.title}</h2><p>{t.adminOrders.description}</p></div>
        <button className="button button-quiet" type="button" onClick={() => void loadData()} disabled={isLoading} data-testid="admin-refresh">
          {t.common.refresh}
        </button>
      </div>

      {!isLoading && !loadError && orders.length > 0 && (
        <OrderListControls
          filters={orderFilters}
          categories={orderCategories}
          onChange={updateOrderFilters}
          onReset={resetOrderFilters}
        />
      )}

      {loadError ? (
        <LoadError retry={() => void loadData()} testId="admin-orders-load-error" />
      ) : isLoading ? (
        <div className="orders-loading" role="status" data-testid="admin-orders-loading">{t.adminOrders.loading}</div>
      ) : orders.length === 0 ? (
        <div className="empty-state orders-empty" data-testid="admin-orders-empty">
          <span className="empty-state-icon" aria-hidden="true">✳</span>
          <h2>{t.adminOrders.emptyTitle}</h2>
          <p>{t.adminOrders.emptyText}</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state orders-empty" data-testid="admin-orders-no-results">
          <span className="empty-state-icon" aria-hidden="true">⌕</span>
          <h2>{t.common.nothingFound}</h2>
          <p>{t.common.changeSearch}</p>
          <button
            className="button button-quiet"
            type="button"
            onClick={resetOrderFilters}
            data-testid="admin-orders-reset-filters"
          >
            {t.common.resetFilters}
          </button>
        </div>
      ) : (
        <>
          <div className="orders-list" data-testid="admin-orders-list">
            {visibleOrders.map((order) => {
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
                            t.toasts.executorAssigned,
                          );
                        }}
                      >
                        <label>
                          {order.executor ? format(t.adminOrders.assignedTo, { name: order.executor.name }) : t.adminOrders.assignLabel}
                          <select
                            value={selectedExecutors[order.id] ?? ""}
                            required
                            disabled={executors.length === 0}
                            onChange={(event) => setSelectedExecutors((values) => ({ ...values, [order.id]: event.target.value }))}
                            data-testid={`assign-executor-${order.id}`}
                          >
                            <option value="" disabled>{t.adminOrders.chooseExecutor}</option>
                            {executors.map((executor) => (
                              <option key={executor.id} value={executor.id} disabled={executor.id === order.executor?.id}>
                                {executor.name} · {formatAmount(executor.hourlyRate ?? 0)}{t.common.perHourShort}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="button button-quiet" type="submit" disabled={isBusy || executors.length === 0} data-testid={`submit-assignment-${order.id}`}>
                          {order.executor ? t.adminOrders.reassign : t.adminOrders.assign}
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
                          t.toasts.invoiceIssued,
                        )}
                        data-testid={`issue-invoice-${order.id}`}
                      >
                        {t.adminOrders.issueInvoice}
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
                              ).catch((error: unknown) => showToast(errorMessage(error, t.toasts.downloadInvoiceFailed)))}
                              data-testid={`download-invoice-pdf-${invoice.id}`}
                            >
                              {format(t.adminOrders.downloadInvoicePdf, { number: invoice.number })}
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
                                    t.toasts.invoiceVoided,
                                  );
                                }}
                              >
                                <label>
                                  {format(t.adminOrders.voidReason, { number: invoice.number })}
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
                                  {t.adminOrders.voidInvoice}
                                </button>
                              </form>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {order.status === "INVOICE_PAID" && (
                      <div className="payment-review" data-testid={`complete-order-section-${order.id}`}>
                        <p className="form-hint">{t.adminOrders.paymentConfirmedHint}</p>
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={isBusy}
                          onClick={() => void runOrderAction(
                            order,
                            () => apiRequest(`/orders/${encodeURIComponent(order.id)}/complete`, { method: "POST" }),
                            t.toasts.orderCompleted,
                          )}
                          data-testid={`complete-order-${order.id}`}
                        >
                          {t.adminOrders.completeOrder}
                        </button>
                      </div>
                    )}
                    {issuedInvoice && (
                      <div className="payment-review" data-testid={`payment-review-${order.id}`}>
                        {pendingPaymentReport ? (
                          <>
                            <p className="form-hint">{t.adminOrders.customerReported}</p>
                            <button
                              className="text-link"
                              type="button"
                              onClick={() => void downloadApiFile(
                                `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(issuedInvoice.id)}/payment-reports/${encodeURIComponent(pendingPaymentReport.id)}/file`,
                                pendingPaymentReport.filename,
                              ).catch((error: unknown) => showToast(errorMessage(error, t.toasts.downloadReceiptFailed)))}
                              data-testid={`download-payment-receipt-${order.id}`}
                            >
                              {format(t.common.downloadReceipt, { filename: pendingPaymentReport.filename })}
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
                                t.toasts.paymentConfirmed,
                              )}
                              data-testid={`confirm-payment-${order.id}`}
                            >
                              {t.adminOrders.confirmPayment}
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
                                  t.toasts.paymentRejected,
                                );
                              }}
                            >
                              <label>
                                {t.adminOrders.rejectReason}
                                <input
                                  required
                                  maxLength={2000}
                                  value={paymentReviewReasons[order.id] ?? ""}
                                  onChange={(event) => setPaymentReviewReasons((values) => ({ ...values, [order.id]: event.target.value }))}
                                  data-testid={`reject-payment-reason-${order.id}`}
                                />
                              </label>
                              <button className="button button-quiet" type="submit" disabled={isBusy} data-testid={`reject-payment-${order.id}`}>
                                {t.adminOrders.rejectReceipt}
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
                              ).catch((error: unknown) => showToast(errorMessage(error, t.toasts.downloadReceiptFailed)))}
                              data-testid={`download-rejected-payment-receipt-${order.id}`}
                            >
                              {format(t.common.receipt, { filename: latestPaymentReport.filename })}
                            </button>
                            <p className="form-hint">{format(t.adminOrders.latestRejected, { comment: latestPaymentReport.reviewComment ?? "" })}</p>
                          </>
                        ) : (
                          <p className="form-hint">{t.adminOrders.awaitingPayment}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              />
            );
            })}
          </div>
          <OrderPagination
            page={currentPage}
            total={filteredOrders.length}
            totalPages={totalPages}
            onPageChange={setOrdersPage}
          />
        </>
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
  const { t, format, formatDate, formatAmount, statusLabel, invoiceStatusLabel } = useI18n();
  const pendingEstimate = order.estimates.find((estimate) => estimate.status === "PENDING");
  return (
    <article className="order-list-card role-order-card" data-testid={testId}>
      <div className="order-list-main">
        <div className="order-list-meta">
          <span>{order.category.name}</span>
          <span className={`order-status order-status-${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span>
        </div>
        <h3>{order.title}</h3>
        <p>{order.description}</p>
        <div className="order-list-footer">
          <span>{format(t.common.customerName, { name: order.customer.name })}</span>
          {order.executor && <span>{format(t.common.executorName, { name: order.executor.name })}</span>}
          <span>{format(t.common.createdOn, { date: formatDate(order.createdAt) })}</span>
          {order.dueAt && <span>{format(t.common.dueOn, { date: formatDate(order.dueAt) })}</span>}
          {order.location && <span>{order.location}</span>}
        </div>
        <Link className="order-detail-link" to={`${panelPath}/orders/${encodeURIComponent(order.id)}`} data-testid={`open-order-${order.id}`}>
          {t.common.openOrder} <span aria-hidden="true">↗</span>
        </Link>
        {pendingEstimate && <p className="form-hint">{format(t.adminOrders.pendingEstimate, { amount: formatAmount(pendingEstimate.amount) })}</p>}
        {order.invoices.map((invoice) => (
          <p className="form-hint" key={invoice.id}>
            {format(t.common.invoiceLine, {
              number: invoice.number,
              amount: formatAmount(invoice.amount),
              status: invoiceStatusLabel(invoice.status),
            })}
          </p>
        ))}
      </div>
      <div className="role-order-actions-container">{renderActions()}</div>
    </article>
  );
}

function LoadError({ retry, testId }: { retry: () => void; testId: string }) {
  const { t } = useI18n();
  return (
    <div className="api-load-error" role="group" data-testid={testId}>
      <button className="button button-quiet" type="button" onClick={retry}>{t.common.retryLoad}</button>
    </div>
  );
}
