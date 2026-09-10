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

function brandInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
  const shopPhone = billFrom.phone || billFrom.phoneno || "";
  const shopInitials = brandInitials(shopName);
  const contact =
    snap.phone || snap.email || invoice.clientPhone || invoice.clientEmail || "";
  const contactLink = contactHref(contact);
  const items = invoice.items || [];
  const currency = invoice.currency || "Rs";
  const hasTax = Number(invoice.taxTotal) > 0;
  const showDueDate = Boolean(invoice.dueDate && invoice.dueDate !== invoice.issueDate);

  return (
    <div className="invoice-doc">
      <style>{`@media print { @page { size: 210mm 148mm; margin: 5mm; } }`}</style>
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
          <div className="invoice-slip-brand-block">
            {shopInitials ? (
              <span className="invoice-slip-mark" aria-hidden="true">
                {shopInitials}
              </span>
            ) : null}
            <div>
              {shopName ? <p className="invoice-slip-brand">{shopName}</p> : null}
              {shopAddress ? <p className="invoice-slip-brand-meta">{shopAddress}</p> : null}
              {shopPhone ? <p className="invoice-slip-brand-meta">{shopPhone}</p> : null}
            </div>
          </div>
          <div className="invoice-slip-title-block">
            <p className="invoice-slip-doc-type">Invoice</p>
            <div className="invoice-doc-title-row invoice-slip-number-row">
              <h1>#{invoice.number}</h1>
              <span className={`status-badge ${statusClass(status)} no-print`}>{status}</span>
            </div>
            <p className="invoice-slip-issued">{formatInvoiceDate(invoice.issueDate)}</p>
          </div>
        </header>

        <section className="invoice-slip-parties">
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
            {contactLink ? (
              <a className="invoice-doc-value invoice-doc-contact" href={contactLink}>
                {contact}
              </a>
            ) : contact ? (
              <p className="invoice-doc-value">{contact}</p>
            ) : null}
          </div>
          <aside className="invoice-slip-amount" aria-label="Amount due">
            <span className="invoice-doc-label">Amount due</span>
            <strong>{formatAmount(currency, invoice.total)}</strong>
            {showDueDate ? (
              <p className="invoice-doc-muted">Due {formatInvoiceDate(invoice.dueDate)}</p>
            ) : null}
          </aside>
        </section>

        <section className="invoice-doc-items invoice-slip-items">
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
                    <th>Description</th>
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
            <div className="invoice-doc-totals">
              <div className="invoice-doc-totals-card">
                {hasTax ? (
                  <>
                    <div className="invoice-doc-totals-row">
                      <span>Subtotal</span>
                      <strong>{formatAmount(currency, invoice.subtotal)}</strong>
                    </div>
                    <div className="invoice-doc-totals-row">
                      <span>Tax</span>
                      <strong>{formatAmount(currency, invoice.taxTotal)}</strong>
                    </div>
                  </>
                ) : null}
                <div className="invoice-doc-totals-row is-grand">
                  <span>Total due</span>
                  <strong>{formatAmount(currency, invoice.total)}</strong>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {invoice.description ? (
          <section className="invoice-slip-notes">
            <span className="invoice-doc-label">Remarks</span>
            <p>{invoice.description}</p>
          </section>
        ) : null}

        <footer className="invoice-slip-footer">
          <div className="invoice-slip-signs">
            <div className="invoice-slip-sign">
              <span>Received by</span>
            </div>
            <div className="invoice-slip-sign">
              <span>{shopName ? `For ${shopName}` : "Authorized signature"}</span>
            </div>
          </div>
          <p className="invoice-slip-thanks">Thank you for your business</p>
          <p className="invoice-slip-legal">This is a computer-generated invoice.</p>
        </footer>
      </article>
    </div>
  );
}
