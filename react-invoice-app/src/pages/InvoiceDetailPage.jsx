import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import InvoiceForm from "../components/invoices/InvoiceForm";
import EmptyState from "../components/ui/EmptyState";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useDeleteInvoiceMutation,
  useGetInvoiceQuery,
  useUpdateInvoiceStatusMutation,
} from "../services/invoiceApi";
import { formatAmount, formatInvoiceDate } from "../utils/invoice";

function formatAddress(source) {
  if (!source) return "";
  const seen = new Set();
  return [source.address, source.area, source.city, source.code, source.country]
    .flatMap((part) => String(part || "").split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function statusClass(status) {
  const key = String(status || "").trim().toLowerCase();
  if (key === "paid") return "paid";
  if (key === "pending") return "pending";
  if (key === "cancelled") return "cancelled";
  return "draft";
}

function contactHref(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (v.includes("@")) return `mailto:${v}`;
  const digits = v.replace(/[^\d+]/g, "");
  if (digits.length >= 7) return `tel:${digits}`;
  return null;
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useGetInvoiceQuery(id);
  const [updateStatus] = useUpdateInvoiceStatusMutation();
  const [deleteInvoice] = useDeleteInvoiceMutation();

  const invoice = data?.invoice;

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Invoice not found"));
  }, [isError, error]);

  const setStatus = async (status) => {
    try {
      await updateStatus({ id, status }).unwrap();
      toast.success(`Status → ${status}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Status update failed"));
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this invoice?")) return;
    try {
      await deleteInvoice(id).unwrap();
      toast.success("Deleted");
      navigate("/invoices");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  if (isLoading) {
    return (
      <div className="invoice-doc">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <EmptyState title="Invoice not found" message="This invoice does not exist or was deleted." />
    );
  }

  const snap = invoice.clientSnapshot || {};
  const status = String(invoice.status || "draft").toLowerCase();
  const clientName = snap.name || invoice.clientName || "—";
  const clientAddress = formatAddress(snap);
  const contact =
    snap.phone || snap.email || invoice.clientPhone || invoice.clientEmail || "";
  const contactLink = contactHref(contact);
  const items = invoice.items || [];
  const currency = invoice.currency || "Rs";

  return (
    <div className="invoice-doc">
      <div className="invoice-doc-nav no-print">
        <button type="button" className="back-link invoice-doc-back" onClick={() => navigate("/invoices")}>
          <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
          Invoices
        </button>
        <div className="invoice-doc-actions">
          {status === "draft" && (
            <Can permission={PERMISSIONS.INVOICES_UPDATE}>
              <button type="button" className="btn edit py-2 px-3" onClick={() => setShowForm(true)}>
                Edit
              </button>
            </Can>
          )}
          {status === "draft" && (
            <Can permission={PERMISSIONS.INVOICES_CHANGE_STATUS}>
              <button type="button" className="btn save py-2 px-3" onClick={() => setStatus("pending")}>
                Send
              </button>
            </Can>
          )}
          {(status === "draft" || status === "pending") && (
            <Can permission={PERMISSIONS.INVOICES_CHANGE_STATUS}>
              <button
                type="button"
                className="btn save-changes py-2 px-3"
                onClick={() => setStatus("paid")}
              >
                Mark as paid
              </button>
            </Can>
          )}
          {(status === "draft" || status === "pending") && (
            <Can permission={PERMISSIONS.INVOICES_CHANGE_STATUS}>
              <button type="button" className="btn cancel py-2 px-3" onClick={() => setStatus("cancelled")}>
                Cancel
              </button>
            </Can>
          )}
          {status !== "paid" && (
            <Can permission={PERMISSIONS.INVOICES_DELETE}>
              <button type="button" className="btn delete py-2 px-3" onClick={onDelete}>
                Delete
              </button>
            </Can>
          )}
        </div>
      </div>

      <article className="invoice-doc-sheet">
        <header className="invoice-doc-hero">
          <div>
            <p className="invoice-doc-kicker">Invoice</p>
            <div className="invoice-doc-title-row">
              <h1>#{invoice.number}</h1>
              <span className={`status-badge ${statusClass(status)}`}>{status}</span>
            </div>
          </div>
          <div className="invoice-doc-hero-amount">
            <span>Amount due</span>
            <strong>{formatAmount(currency, invoice.total)}</strong>
          </div>
        </header>

        <section className="invoice-doc-meta">
          <div>
            <span className="invoice-doc-label">Bill to</span>
            {invoice.clientId != null ? (
              <Link to={`/clients/${invoice.clientId}`} className="invoice-doc-client">
                {clientName}
              </Link>
            ) : (
              <span className="invoice-doc-client">{clientName}</span>
            )}
            {clientAddress ? <p className="invoice-doc-muted">{clientAddress}</p> : null}
          </div>
          <div>
            <span className="invoice-doc-label">Invoice date</span>
            <p className="invoice-doc-value">{formatInvoiceDate(invoice.issueDate)}</p>
          </div>
          <div>
            <span className="invoice-doc-label">Contact</span>
            {contactLink ? (
              <a className="invoice-doc-value invoice-doc-contact" href={contactLink}>
                {contact}
              </a>
            ) : (
              <p className="invoice-doc-value">{contact || "—"}</p>
            )}
          </div>
        </section>

        <section className="invoice-doc-items">
          <div className="invoice-doc-items-head">
            <h2>Products</h2>
            <span className="invoice-doc-count">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {!items.length ? (
            <EmptyState
              className="!border-0 !bg-transparent !shadow-none"
              title="No line items"
              message="This invoice has no products yet."
            />
          ) : (
            <div className="invoice-doc-table-wrap">
              <table className="invoice-doc-table">
                <thead>
                  <tr>
                    <th className="is-index">#</th>
                    <th>Item</th>
                    <th className="is-num">Qty</th>
                    <th className="is-num">Price</th>
                    <th className="is-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.productId}-${item.name}-${index}`}>
                      <td className="is-index">{index + 1}</td>
                      <td>
                        <span className="invoice-doc-item-name">{item.name}</span>
                        {item.sku ? <span className="invoice-doc-muted">{item.sku}</span> : null}
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
            <div className="invoice-doc-due">
              <span>Amount due</span>
              <strong>{formatAmount(currency, invoice.total)}</strong>
            </div>
          ) : null}
        </section>
      </article>

      {showForm && (
        <InvoiceForm invoice={invoice} onClose={() => setShowForm(false)} onSaved={() => refetch()} />
      )}
    </div>
  );
}
