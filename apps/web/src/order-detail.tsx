import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiRequest, downloadApiFile } from "./api";
import { useToast } from "./toast";
import { useI18n } from "./i18n";

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
  const { t, errorMessage } = useI18n();

  const loadOrder = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      setOrder(await apiRequest<WorkOrderDetail>(`/orders/${encodeURIComponent(orderId)}`));
    } catch (error) {
      setHasError(true);
      showToast(errorMessage(error, t.toasts.loadOrderFailed));
    } finally {
      setIsLoading(false);
    }
  }, [orderId, showToast, errorMessage, t]);

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
            <div className="eyebrow">{t.orderDetail.eyebrow}</div>
            <h2 id="order-detail-title">{order?.title ?? t.orderDetail.titleFallback}</h2>
          </div>
          <button type="button" className="order-detail-close" onClick={onClose} aria-label={t.orderDetail.closeAria} data-testid="close-order-detail">
            ×
          </button>
        </header>
        <div className="order-detail-content">
          {isLoading ? (
            <div className="orders-loading" role="status">{t.orderDetail.loading}</div>
          ) : hasError ? (
            <div className="order-detail-error">
              <p>{t.orderDetail.loadError}</p>
              <button className="button button-quiet" type="button" onClick={() => void loadOrder()}>{t.common.retry}</button>
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
  const {
    t,
    format,
    formatDate,
    formatAmount,
    formatBytes,
    formatMinutes,
    errorMessage,
    statusLabel,
    estimateStatusLabel,
    invoiceStatusLabel,
    paymentReportStatusLabel,
  } = useI18n();
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
      showToast(t.toasts.commentAdded, "success");
      await onReload();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.addCommentFailed));
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
      showToast(t.toasts.fileTooLarge);
      return;
    }
    setIsUploading(true);
    try {
      await apiRequest(`/orders/${encodeURIComponent(order.id)}/attachments`, {
        method: "POST",
        body: formData,
      });
      form.reset();
      showToast(t.toasts.fileAttached, "success");
      await onReload();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.attachFileFailed));
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
      showToast(t.toasts.orderCancelled, "success");
      await onReload();
    } catch (error) {
      showToast(errorMessage(error, t.toasts.cancelOrderFailed));
    } finally {
      setIsCancelling(false);
    }
  }
  return (
    <div className="order-detail-body">
      <div className="order-detail-meta">
        <span>{order.category.name}</span>
        <span className={`order-status order-status-${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span>
      </div>
      <p className="order-detail-description">{order.description}</p>
      <div className="order-detail-facts">
        <DetailFact label={t.common.customer} value={order.customer.name} />
        <DetailFact label={t.common.executor} value={order.executor?.name ?? t.common.notAssigned} />
        <DetailFact label={t.common.created} value={formatDate(order.createdAt)} />
        <DetailFact label={t.common.due} value={order.dueAt ? formatDate(order.dueAt) : t.common.notSpecified} />
        {order.location && <DetailFact label={t.common.location} value={order.location} />}
        {order.acceptedAt && <DetailFact label={t.orderDetail.acceptedByCustomer} value={formatDate(order.acceptedAt)} />}
        {order.completedAt && <DetailFact label={t.orderDetail.completed} value={formatDate(order.completedAt)} />}
      </div>
      {order.cancellationReason && <DetailSection title={t.orderDetail.cancellationReason}><p>{order.cancellationReason}</p></DetailSection>}
      {order.approvedAmount !== null && order.approvedAmount !== undefined && (
        <DetailSection title={t.orderDetail.approvedEstimate}>
          <p>{format(t.orderDetail.approvedLine, {
            amount: formatAmount(order.approvedAmount),
            hours: order.approvedHours ?? 0,
            rate: formatAmount(order.approvedHourlyRate ?? 0),
          })}</p>
          {order.timeEntry && (
            <p className="order-detail-subtext">
              {format(t.orderDetail.tracked, { duration: formatMinutes(order.timeEntry.minutes) })}
              {order.timeEntry.comment ? ` · ${order.timeEntry.comment}` : ""}
            </p>
          )}
        </DetailSection>
      )}
      {order.estimates.length > 0 && (
        <DetailSection title={t.orderDetail.estimates}>
          <ul className="order-detail-list">
            {order.estimates.map((estimate) => (
              <li key={estimate.id}>
                <span>{format(t.orderDetail.estimateLine, {
                  amount: formatAmount(estimate.amount),
                  hours: estimate.hours,
                  status: estimateStatusLabel(estimate.status),
                })}</span>
                <small>{formatDate(estimate.proposedAt)}{estimate.responseComment ? ` · ${estimate.responseComment}` : ""}</small>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
      {(order.attachments.length > 0 || canUploadAttachment) && (
        <DetailSection title={`${t.orderDetail.files}${order.attachments.length > 0 ? ` (${order.attachments.length})` : ""}`}>
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
                    ).catch((error: unknown) => showToast(errorMessage(error, t.toasts.downloadAttachmentFailed)))}
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
                {t.orderDetail.attachLabel}
                <input type="file" name="file" required data-testid="order-attachment-file" />
              </label>
              <button className="button button-quiet" type="submit" disabled={isUploading} data-testid="upload-order-attachment">
                {isUploading ? t.orderDetail.attaching : t.orderDetail.attach}
              </button>
            </form>
          )}
        </DetailSection>
      )}
      {order.invoices.length > 0 && (
        <DetailSection title={t.orderDetail.invoices}>
          <ul className="order-detail-list">
            {order.invoices.map((invoice) => (
              <li key={invoice.id}>
                <span>{invoice.number} · {formatAmount(invoice.amount)} {invoice.currency} · {invoiceStatusLabel(invoice.status)}</span>
                <small>
                  {format(t.orderDetail.issued, { date: formatDate(invoice.issuedAt) })}
                  {invoice.paidAt ? ` · ${format(t.orderDetail.paid, { date: formatDate(invoice.paidAt) })}` : ""}
                  {invoice.voidReason ? ` · ${format(t.orderDetail.voided, { reason: invoice.voidReason })}` : ""}
                  {" · "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => void downloadApiFile(
                      `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(invoice.id)}/pdf`,
                      `${invoice.number}.pdf`,
                    ).catch((error: unknown) => showToast(errorMessage(error, t.toasts.downloadInvoiceFailed)))}
                    data-testid={`download-invoice-pdf-${invoice.id}`}
                  >
                    {t.orderDetail.downloadPdf}
                  </button>
                </small>
                {invoice.paymentReports?.map((report) => (
                  <small key={report.id}>
                    {format(t.common.receipt, { filename: report.filename })} · {paymentReportStatusLabel(report.status)}
                    {report.reviewComment ? ` · ${report.reviewComment}` : ""}
                    {" · "}
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => void downloadApiFile(
                        `/orders/${encodeURIComponent(order.id)}/invoices/${encodeURIComponent(invoice.id)}/payment-reports/${encodeURIComponent(report.id)}/file`,
                        report.filename,
                      ).catch((error: unknown) => showToast(errorMessage(error, t.toasts.downloadReceiptFailed)))}
                    >
                      {t.orderDetail.download}
                    </button>
                  </small>
                ))}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
      <DetailSection title={`${t.orderDetail.comments}${order.comments.length > 0 ? ` (${order.comments.length})` : ""}`}>
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
            {t.orderDetail.newComment}
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
            {isCommenting ? t.orderDetail.adding : t.orderDetail.addComment}
          </button>
        </form>
      </DetailSection>
      {canCancel && (
        <DetailSection title={t.orderDetail.cancelTitle}>
          <form className="inline-action-form" onSubmit={(event) => void cancelOrder(event)} data-testid="cancel-order-form">
            <label>
              {notStarted ? t.orderDetail.cancelReasonOptional : t.orderDetail.cancelReason}
              <input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                maxLength={2000}
                required={!notStarted}
                data-testid="cancel-order-reason"
              />
            </label>
            <button className="button button-quiet" type="submit" disabled={isCancelling || (!notStarted && !cancelReason.trim())} data-testid="cancel-order-submit">
              {isCancelling ? t.orderDetail.cancelling : t.orderDetail.cancel}
            </button>
          </form>
        </DetailSection>
      )}
      {order.statusHistory.length > 0 && (
        <DetailSection title={t.orderDetail.history}>
          <ol className="order-detail-timeline">
            {[...order.statusHistory].reverse().map((entry) => (
              <li key={entry.id}>
                <span className="order-detail-timeline-dot" />
                <div>
                  <b>{statusLabel(entry.toStatus)}</b>
                  <small>{formatDate(entry.createdAt)} · {entry.changedBy.name}</small>
                  {entry.note && <p>{entry.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </DetailSection>
      )}
      <footer className="order-detail-footer">
        <span>{format(t.orderDetail.lastUpdated, { date: formatDate(order.updatedAt) })}</span>
        <Link className="button button-quiet" to={panelPath}>
          {t.orderDetail.backToOrders}
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
