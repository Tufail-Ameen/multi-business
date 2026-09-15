import { faAngleLeft, faCheck, faFileInvoice } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useConvertOrderMutation,
  useGetOrderQuery,
  useUpdateOrderMutation,
} from "../services/invoiceApi";
import { formatAmount, formatInvoiceDate } from "../utils/invoice";

function statusLabel(status) {
  const key = String(status || "").trim().toLowerCase();
  if (key === "confirmed") return "Confirmed";
  if (key === "converted") return "Converted";
  if (key === "cancelled") return "Cancelled";
  if (key === "placed") return "Placed";
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Draft";
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function phoneHref(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: order, isLoading, isError, error } = useGetOrderQuery(id);
  const [updateOrder, updateState] = useUpdateOrderMutation();
  const [convertOrder, convertState] = useConvertOrderMutation();

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Order not found"));
  }, [isError, error]);

  const setStatus = async (status) => {
    try {
      await updateOrder({ id, status }).unwrap();
      toast.success(`Status → ${status}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Status update failed"));
    }
  };

  const onConvert = async () => {
    const confirmed = await Swal.fire({
      title: `Convert ${order.number} to invoice?`,
      text: "Stock will be deducted when the invoice is created as pending.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Convert",
      confirmButtonColor: "#2d6a56",
    });
    if (!confirmed.isConfirmed) return;
    try {
      const result = await convertOrder({ id }).unwrap();
      toast.success(`Invoice ${result.invoice?.number || ""} created`);
      if (result.invoice?.id) navigate(`/invoices/${result.invoice.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Convert failed"));
    }
  };

  if (isLoading) {
    return (
      <div className="client-profile">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <EmptyState title="Order not found" message="This order does not exist or was deleted." />
    );
  }

  const status = String(order.status || "").toLowerCase();
  const canAct = status === "placed" || status === "confirmed";
  const snap = order.clientSnapshot || {};
  const clientName = snap.name || order.clientName || "Walk-in";
  const clientPhone = snap.phone || order.clientPhone || "";
  const clientArea = order.clientArea || snap.area || "";
  const callHref = phoneHref(clientPhone);
  const items = order.items || [];
  const currency = order.currency || "Rs";
  const units = items.reduce((sum, item) => sum + money(item.quantity), 0);
  const sourceLabel = order.source === "store" ? "Store order" : "Staff order";
  const place = [clientArea, order.rateListNumber, order.placedAt ? formatInvoiceDate(order.placedAt) : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="client-profile">
      <article className="client-record order-record">
        <div className="client-record-toolbar no-print">
          <button type="button" className="client-record-back" onClick={() => navigate("/orders")}>
            <FontAwesomeIcon icon={faAngleLeft} size="2xs" />
            Orders
          </button>
          <div className="client-record-actions">
            {status === "placed" && (
              <Can permission={PERMISSIONS.ORDERS_UPDATE}>
                <button
                  type="button"
                  className="btn edit py-2 px-3"
                  disabled={updateState.isLoading}
                  onClick={() => setStatus("confirmed")}
                >
                  <FontAwesomeIcon icon={faCheck} />
                  Confirm
                </button>
              </Can>
            )}
            {canAct && (
              <Can permission={PERMISSIONS.ORDERS_CONVERT}>
                <button
                  type="button"
                  className="btn save-changes py-2 px-3"
                  disabled={convertState.isLoading}
                  onClick={onConvert}
                >
                  <FontAwesomeIcon icon={faFileInvoice} />
                  Convert to invoice
                </button>
              </Can>
            )}
            {order.convertedInvoiceId ? (
              <button
                type="button"
                className="btn save-changes py-2 px-3"
                onClick={() => navigate(`/invoices/${order.convertedInvoiceId}`)}
              >
                <FontAwesomeIcon icon={faFileInvoice} />
                Open invoice
              </button>
            ) : null}
            {canAct && (
              <Can permission={PERMISSIONS.ORDERS_UPDATE}>
                <button
                  type="button"
                  className="btn cancel py-2 px-3"
                  disabled={updateState.isLoading}
                  onClick={() => setStatus("cancelled")}
                >
                  Cancel
                </button>
              </Can>
            )}
          </div>
        </div>

        <header className="client-record-letterhead">
          <div className="client-record-brand">
            <span className="client-record-mark" aria-hidden="true">
              {initials(clientName)}
            </span>
            <div className="min-w-0">
              {order.clientId != null ? (
                <h1>
                  <Link to={`/clients/${order.clientId}`} className="order-record-client">
                    {clientName}
                  </Link>
                </h1>
              ) : (
                <h1>{clientName}</h1>
              )}
              {place ? <p>{place}</p> : null}
              {callHref ? (
                <a href={callHref}>{clientPhone}</a>
              ) : clientPhone ? (
                <p>{clientPhone}</p>
              ) : null}
            </div>
          </div>
          <div className="client-record-doctype">
            <span>{sourceLabel}</span>
            <strong>#{order.number}</strong>
          </div>
        </header>

        <section className="client-record-stats" aria-label="Order summary">
          <div>
            <span>Status</span>
            <strong>{statusLabel(status)}</strong>
          </div>
          <div>
            <span>Quantity</span>
            <strong>{units || "—"}</strong>
          </div>
          <div>
            <span>Amount</span>
            <strong>{formatAmount(currency, order.total)}</strong>
          </div>
        </section>

        <section className="order-record-items">
          <div className="invoice-doc-items-head">
            <h2>Items</h2>
            <span className="invoice-doc-count">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {order.notes ? <p className="order-record-notes">{order.notes}</p> : null}

          {!items.length ? (
            <EmptyState
              className="!border-0 !bg-transparent !shadow-none"
              title="No line items"
              message="This order has no products yet."
            />
          ) : (
            <div className="invoice-doc-table-wrap">
              <table className="invoice-doc-table purchase-doc-table">
                <thead>
                  <tr>
                    <th className="is-index">#</th>
                    <th>Item</th>
                    <th className="is-num">Qty</th>
                    <th className="is-num">Rate</th>
                    <th className="is-num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.productId}-${item.name}-${index}`}>
                      <td className="is-index">{index + 1}</td>
                      <td>
                        <span className="invoice-doc-item-name">{item.name}</span>
                        {item.sku ? (
                          <span className="invoice-doc-muted">{item.sku}</span>
                        ) : (
                          <span className="invoice-doc-muted">
                            {item.quantity} × {formatAmount(currency, item.unitPrice)}
                          </span>
                        )}
                      </td>
                      <td className="is-num">{item.quantity}</td>
                      <td className="is-num">{formatAmount(currency, item.unitPrice)}</td>
                      <td className="is-num is-total">{formatAmount(currency, item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {items.length ? (
            <div className="invoice-doc-totals">
              <div className="invoice-doc-totals-card">
                {money(order.taxTotal) > 0 ? (
                  <>
                    <div className="invoice-doc-totals-row">
                      <span>Subtotal</span>
                      <strong>{formatAmount(currency, order.subtotal)}</strong>
                    </div>
                    <div className="invoice-doc-totals-row">
                      <span>Tax</span>
                      <strong>{formatAmount(currency, order.taxTotal)}</strong>
                    </div>
                  </>
                ) : null}
                <div className="invoice-doc-totals-row is-grand">
                  <span>Amount</span>
                  <strong>{formatAmount(currency, order.total)}</strong>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </article>
    </div>
  );
}
