import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiRequest, downloadApiFile, getUserFacingError } from "./api";
import { useToast } from "./toast";

type OrderStatusHistory = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
  changedBy: { id: string; name: string };
};
type OrderComment = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string };
};
type OrderAttachment = {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  createdAt: string;
};
type Invoice = {
  id: string;
  number: string;
  status: string;
  customerName: string;
  executorName: string;
  hours: number | string;
  hourlyRate: number | string;
  amount: number | string;
  currency: string;
  issuedAt: string;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  paymentReports?: {
    id: string;
    filename: string;
    status: string;
    reviewComment: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  }[];
};
type WorkOrderDetail = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: { name: string };
  customer: { name: string };
  executor: { name: string } | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  location: string | null;
  approvedHours: number | string | null;
  approvedHourlyRate: number | string | null;
  approvedAmount: number | string | null;
  cancellationReason: string | null;
  estimates: {
    id: string;
    hours: number | string;
    hourlyRate: number | string;
    amount: number | string;
    status: string;
    responseComment: string | null;
    proposedAt: string;
    respondedAt: string | null;
  }[];
  assignments: {
    id: string;
    outcome: string;
    assignedAt: string;
    endedAt: string | null;
  }[];
  statusHistory: OrderStatusHistory[];
  attachments: OrderAttachment[];
  comments: OrderComment[];
  timeEntry: { minutes: number; comment: string | null; updatedAt: string } | null;
  invoices: Invoice[];
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

export function OrderDetailView({
  orderId,
  panelPath,
  role,
  onClose,
}: {
  orderId: string;
  panelPath: string;
  role: "CUSTOMER" | "EXECUTOR" | "ADMIN";
  onClose: () => void;
}) {
  const [order, setOrder] = useState<WorkOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { showToast } = useToast();

  const loadOrder = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      setOrder(await apiRequest<WorkOrderDetail>(`/orders/${encodeURIComponent(orderId)}`));
    } catch (error) {
      setHasError(true);
      showToast(getUserFacingError(error, "Не удалось загрузить заказ."));
    } finally {
      setIsLoading(false);
    }
  }, [orderId, showToast]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="order-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="order-detail-backdrop"
    >
      <section
        className="order-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        data-testid="order-detail"
      >
        <header className="order-detail-header">
          <div>
            <div className="eyebrow">КАРТОЧКА ЗАКАЗА</div>
            <h2 id="order-detail-title">{order?.title ?? "Заказ"}</h2>
          </div>
          <button type="button" className="order-detail-close" onClick={onClose} aria-label="Закрыть карточку заказа" data-testid="close-order-detail">
            ×
          </button>
        </header>
        <div className="order-detail-content">
          {isLoading ? (
            <div className="orders-loading" role="status">Загружаем заказ…</div>
          ) : hasError ? (
            <div className="order-detail-error">
              <p>Не удалось загрузить карточку заказа.</p>
              <button className="button button-quiet" type="button" onClick={() => void loadOrder()}>Повторить</button>
            </div>
          ) : order ? (
            <OrderDetailContent order={order} panelPath={panelPath} role={role} onReload={loadOrder} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function OrderDetailContent({
  order,
  panelPath,
  role,
  onReload,
}: {
  order: WorkOrderDetail;
  panelPath: string;
  role: "CUSTOMER" | "EXECUTOR" | "ADMIN";
  onReload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [comment, setComment] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const notStarted = order.status === "NEW" || order.status === "WAITING_DISTRIBUTION" || order.status === "ASSIGNED";
  const canCancel =
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED" &&
    order.status !== "INVOICE_ISSUED" &&
    order.status !== "INVOICE_PAID" &&
    (role === "ADMIN" || (role === "CUSTOMER" && notStarted));
  const canUploadAttachment =
    role === "ADMIN" ||
    (role === "CUSTOMER" && order.status === "NEW") ||
    (role === "EXECUTOR" && order.executor !== null);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = comment.trim();
    if (!content) return;
    setIsCommenting(true);
    try {
      await apiRequest(`/orders/${encodeURIComponent(order.id)}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setComment("");
      showToast("Комментарий добавлен.", "success");
      await onReload();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось добавить комментарий."));
    } finally {
      setIsCommenting(false);
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    if (file.size > 1_048_576) {
      showToast("Файл слишком большой. Максимальный размер — 1 МБ.");
      return;
    }
    setIsUploading(true);
    try {
      await apiRequest(`/orders/${encodeURIComponent(order.id)}/attachments`, {
        method: "POST",
        body: formData,
      });
      form.reset();
      showToast("Файл прикреплён к заказу.", "success");
      await onReload();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось прикрепить файл."));
    } finally {
      setIsUploading(false);
    }
  }

  async function cancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (!notStarted && !reason) return;
    setIsCancelling(true);
    try {
      await apiRequest(`/orders/${encodeURIComponent(order.id)}/cancel`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      });
      setCancelReason("");
      showToast("Заказ отменён.", "success");
      await onReload();
    } catch (error) {
      showToast(getUserFacingError(error, "Не удалось отменить заказ."));
    } finally {
      setIsCancelling(false);
    }
  }
  return (
    <div className="order-detail-body">
      <div className="order-detail-meta">
        <span>{order.category.name}</span>
        <span className={`order-status order-status-${order.status.toLowerCase()}`}>{statusLabels[order.status] ?? order.status}</span>
      </div>
      <p className="order-detail-description">{order.description}</p>
      <div className="order-detail-facts">
        <DetailFact label="Заказчик" value={order.customer.name} />
        <DetailFact label="Исполнитель" value={order.executor?.name ?? "Не назначен"} />
        <DetailFact label="Создан" value={formatDate(order.createdAt)} />
        <DetailFact label="Срок" value={order.dueAt ? formatDate(order.dueAt) : "Не указан"} />
        {order.location && <DetailFact label="Место выполнения" value={order.location} />}
        {order.acceptedAt && <DetailFact label="Принят заказчиком" value={formatDate(order.acceptedAt)} />}
        {order.completedAt && <DetailFact label="Завершён" value={formatDate(order.completedAt)} />}
      </div>
      {order.cancellationReason && <DetailSection title="Причина отмены"><p>{order.cancellationReason}</p></DetailSection>}
      {order.approvedAmount !== null && order.approvedAmount !== undefined && (
        <DetailSection title="Согласованная оценка">
          <p>{formatAmount(order.approvedAmount)} · {order.approvedHours} ч × {formatAmount(order.approvedHourlyRate ?? 0)} / ч</p>
          {order.timeEntry && (
            <p className="order-detail-subtext">
              Учтено {formatMinutes(order.timeEntry.minutes)}
              {order.timeEntry.comment ? ` · ${order.timeEntry.comment}` : ""}
            </p>
          )}
        </DetailSection>
      )}
      {order.estimates.length > 0 && (
        <DetailSection title="Оценки">
          <ul className="order-detail-list">
            {order.estimates.map((estimate) => (
              <li key={estimate.id}>
                <span>{formatAmount(estimate.amount)} · {estimate.hours} ч · {estimate.status}</span>
                <small>{formatDate(estimate.proposedAt)}{estimate.responseComment ? ` · ${estimate.responseComment}` : ""}</small>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
      {(order.attachments.length > 0 || canUploadAttachment) && (
        <DetailSection title={`Файлы${order.attachments.length > 0 ? ` (${order.attachments.length})` : ""}`}>
          {order.attachments.length > 0 && (
            <ul className="order-detail-list">
              {order.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => void downloadApiFile(
                      `/orders/${encodeURIComponent(order.id)}/attachments/${encodeURIComponent(attachment.id)}`,
                      attachment.filename,
                    ).catch((error: unknown) => showToast(getUserFacingError(error, "Не удалось скачать файл заказа.")))}
                    data-testid={`download-order-attachment-${attachment.id}`}
                  >
                    {attachment.filename}
                  </button>
                  <small>{formatBytes(attachment.sizeBytes)} · {formatDate(attachment.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
          {canUploadAttachment && (
            <form className="inline-action-form" onSubmit={(event) => void uploadAttachment(event)} data-testid="attachment-upload-form">
              <label>
                Прикрепить файл (не более 1 MB)
                <input type="file" name="file" required data-testid="order-attachment-file" />
              </label>
              <button className="button button-quiet" type="submit" disabled={isUploading} data-testid="upload-order-attachment">
                {isUploading ? "Загружаем…" : "Прикрепить"}
              </button>
            </form>
          )}
        </DetailSection>
      )}
      {order.invoices.length > 0 && (
        <DetailSection title="Счета">
          <ul className="order-detail-list">
            {order.invoices.map((invoice) => (
              <li key={invoice.id}>
                <span>{invoice.number} · {formatAmount(invoice.amount)} {invoice.currency} · {invoiceStatus(invoice.status)}</span>
                <small>
                  Выставлен {formatDate(invoice.issuedAt)}
                  {invoice.paidAt ? ` · Оплачен ${formatDate(invoice.paidAt)}` : ""}
                  {invoice.voidReason ? ` · Аннулирован: ${invoice.voidReason}` : ""}
                  {" · "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => void downloadApiFile(
                      `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(invoice.id)}/pdf`,
                      `${invoice.number}.pdf`,
                    ).catch((error: unknown) => showToast(getUserFacingError(error, "Не удалось скачать PDF счёта.")))}
                    data-testid={`download-invoice-pdf-${invoice.id}`}
                  >
                    Скачать PDF
                  </button>
                </small>
                {invoice.paymentReports?.map((report) => (
                  <small key={report.id}>
                    Чек: {report.filename} · {paymentReportStatus(report.status)}
                    {report.reviewComment ? ` · ${report.reviewComment}` : ""}
                    {" · "}
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => void downloadApiFile(
                        `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(invoice.id)}/payment-reports/${encodeURIComponent(report.id)}/file`,
                        report.filename,
                      ).catch((error: unknown) => showToast(getUserFacingError(error, "Не удалось скачать чек.")))}
                    >
                      Скачать
                    </button>
                  </small>
                ))}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
      <DetailSection title={`Комментарии${order.comments.length > 0 ? ` (${order.comments.length})` : ""}`}>
        {order.comments.length > 0 && (
          <ul className="order-detail-comments">
            {order.comments.map((item) => (
              <li key={item.id}>
                <div><b>{item.author.name}</b><time>{formatDate(item.createdAt)}</time></div>
                <p>{item.content}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="inline-action-form" onSubmit={(event) => void addComment(event)} data-testid="order-comment-form">
          <label>
            Новый комментарий
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={10_000}
              rows={2}
              required
              data-testid="order-comment-input"
            />
          </label>
          <button className="button button-quiet" type="submit" disabled={isCommenting || !comment.trim()} data-testid="submit-order-comment">
            {isCommenting ? "Отправляем…" : "Добавить комментарий"}
          </button>
        </form>
      </DetailSection>
      {canCancel && (
        <DetailSection title="Отмена заказа">
          <form className="inline-action-form" onSubmit={(event) => void cancelOrder(event)} data-testid="cancel-order-form">
            <label>
              {notStarted ? "Причина (необязательно)" : "Причина отмены"}
              <input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={2000}
                required={!notStarted}
                data-testid="cancel-order-reason"
              />
            </label>
            <button className="button button-quiet" type="submit" disabled={isCancelling || (!notStarted && !cancelReason.trim())} data-testid="cancel-order-submit">
              {isCancelling ? "Отменяем…" : "Отменить заказ"}
            </button>
          </form>
        </DetailSection>
      )}
      {order.statusHistory.length > 0 && (
        <DetailSection title="История заказа">
          <ol className="order-detail-timeline">
            {[...order.statusHistory].reverse().map((entry) => (
              <li key={entry.id}>
                <span className="order-detail-timeline-dot" />
                <div>
                  <b>{statusLabels[entry.toStatus] ?? entry.toStatus}</b>
                  <small>{formatDate(entry.createdAt)} · {entry.changedBy.name}</small>
                  {entry.note && <p>{entry.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </DetailSection>
      )}
      <footer className="order-detail-footer">
        <span>Последнее обновление: {formatDate(order.updatedAt)}</span>
        <Link className="button button-quiet" to={panelPath}>
          Вернуться к заказам
        </Link>
      </footer>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="order-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><span>{value}</span></div>;
}

function formatAmount(value: number | string): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} Б` : `${(bytes / 1024).toFixed(1)} КБ`;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} ч ${remainder} мин` : `${remainder} мин`;
}

function invoiceStatus(status: string): string {
  if (status === "ISSUED") return "ожидает оплаты";
  if (status === "PAID") return "оплачен";
  if (status === "VOID") return "аннулирован";
  return status;
}

function paymentReportStatus(status: string): string {
  if (status === "PENDING") return "на проверке";
  if (status === "CONFIRMED") return "подтверждён";
  if (status === "REJECTED") return "отклонён";
  return status;
}
