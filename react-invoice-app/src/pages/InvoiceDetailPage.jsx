import { faAngleLeft, faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetInvoiceQuery, useUpdateInvoiceStatusMutation } from "../services/invoiceApi";
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
  const { activeBusiness } = useAuth();

  const { data, isLoading, isError, error } = useGetInvoiceQuery(id);
  const [updateStatus] = useUpdateInvoiceStatusMutation();

  const invoice = data?.invoice;

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Invoice not found"));
  }, [isError, error]);

  useEffect(() => {
    if (!invoice?.number) return undefined;
    const previous = document.title;
    document.title = invoice.number;
    return () => {
      document.title = previous;
    };
  }, [invoice?.number]);

  const setStatus = async (status) => {
    try {
      await updateStatus({ id, status }).unwrap();
      toast.success(`Status → ${status}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Status update failed"));
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
  const billFrom = invoice.billFrom || {};
  const status = String(invoice.status || "draft").toLowerCase();
  const clientName = snap.name || invoice.clientName || "—";
  const clientAddress = formatAddress(snap);
  const shopName = billFrom.name || activeBusiness?.name || "";
  const shopAddress = formatAddress(billFrom);
  const contact =
    snap.phone || snap.email || invoice.clientPhone || invoice.clientEmail || "";
  const contactLink = contactHref(contact);
  const items = invoice.items || [];
  const currency = invoice.currency || "Rs";
  const hasTax = Number(invoice.taxTotal) > 0;

  return (
    <div className="invoice-doc">
      <div className="invoice-doc-nav no-print">
        <button type="button" className="back-link invoice-doc-back" onClick={() => navigate("/invoices")}>
          <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
          Invoices
        </button>
        <div className="invoice-doc-actions">
          <Can permission={PERMISSIONS.INVOICES_PRINT}>
            <button type="button" className="btn edit py-2 px-3" onClick={() => window.print()}>
              <FontAwesomeIcon icon={faPrint} className="me-1" />
              Print
            </button>
          </Can>
          {status === "draft" && (
            <Can permission={PERMISSIONS.INVOICES_CHANGE_STATUS}>
              <button type="button" className="btn save py-2 px-3" onClick={() => setStatus("pending")}>
                Send
              </button>
            </Can>
          )}
        </div>
      </div>

      <article className="invoice-doc-sheet invoice-slip">
        <header className="invoice-slip-letterhead">
          {shopName ? <p className="invoice-slip-brand">{shopName}</p> : null}
          {shopAddress ? <p className="invoice-slip-brand-meta">{shopAddress}</p> : null}
          <p className="invoice-slip-doc-type">Cash memo / Invoice</p>
        </header>

        <section className="invoice-doc-hero invoice-slip-banner">
          <div>
            <p className="invoice-doc-kicker">Invoice no.</p>
            <div className="invoice-doc-title-row">
              <h1>#{invoice.number}</h1>
              <span className={`status-badge ${statusClass(status)} no-print`}>{status}</span>
            </div>
          </div>
          <div className="invoice-doc-hero-amount">
            <span>Amount due</span>
            <strong>{formatAmount(currency, invoice.total)}</strong>
          </div>
        </section>

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
            {invoice.dueDate && invoice.dueDate !== invoice.issueDate ? (
              <p className="invoice-doc-muted">Due {formatInvoiceDate(invoice.dueDate)}</p>
            ) : null}
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
            <span className="invoice-doc-count no-print">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {!items.length ? (
            <EmptyState
              className="!border-0 !bg-transparent !shadow-none no-print"
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
            <>
              {hasTax ? (
                <div className="invoice-doc-totals">
                  <div className="invoice-doc-totals-card">
                    <div className="invoice-doc-totals-row">
                      <span>Subtotal</span>
                      <strong>{formatAmount(currency, invoice.subtotal)}</strong>
                    </div>
                    <div className="invoice-doc-totals-row">
                      <span>Tax</span>
                      <strong>{formatAmount(currency, invoice.taxTotal)}</strong>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="invoice-doc-due">
                <span>Amount due</span>
                <strong>{formatAmount(currency, invoice.total)}</strong>
              </div>
            </>
          ) : null}
        </section>

        {invoice.description ? (
          <p className="invoice-slip-notes">{invoice.description}</p>
        ) : null}

        <footer className="invoice-slip-footer">
          <p className="invoice-slip-thanks">Thank you for your business</p>
          <div className="invoice-slip-signs">
            <div className="invoice-slip-sign">
              <span>Received by</span>
            </div>
            <div className="invoice-slip-sign">
              <span>{shopName ? `For ${shopName}` : "Authorized"}</span>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
