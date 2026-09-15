import { faAngleLeft, faCheck, faPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCancelPurchaseMutation,
  useConfirmPurchaseMutation,
  useDeletePurchaseMutation,
  useGetPurchaseQuery,
  useGetSupplierQuery,
} from "../services/invoiceApi";
import { formatAmount, formatInvoiceDate } from "../utils/invoice";

function statusKey(status) {
  return String(status || "").trim().toLowerCase();
}

function statusLabel(status) {
  const key = statusKey(status);
  if (key === "confirmed") return "Confirmed";
  if (key === "cancelled") return "Cancelled";
  return "Draft";
}

function vendorInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "V";
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

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useGetPurchaseQuery(id);
  const [confirmPurchase] = useConfirmPurchaseMutation();
  const [cancelPurchase] = useCancelPurchaseMutation();
  const [deletePurchase] = useDeletePurchaseMutation();

  const purchase = data?.purchase;
  const { data: supplierData } = useGetSupplierQuery(purchase?.supplierId, {
    skip: purchase?.supplierId == null,
  });
  const supplier = supplierData?.supplier;

  const status = statusKey(purchase?.status);
  const isDraft = status === "draft";
  const isConfirmed = status === "confirmed";

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Purchase not found"));
  }, [isError, error]);

  const onConfirm = async () => {
    if (
      !window.confirm(
        "Confirm this purchase? Stock will increase and a vendor payable will be created."
      )
    ) {
      return;
    }
    try {
      await confirmPurchase(id).unwrap();
      toast.success("Purchase confirmed — stock updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Confirm failed"));
    }
  };

  const onCancel = async () => {
    if (!window.confirm("Cancel this draft purchase?")) return;
    try {
      await cancelPurchase(id).unwrap();
      toast.success("Purchase cancelled");
    } catch (err) {
      toast.error(getErrorMessage(err, "Cancel failed"));
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete ${purchase?.purchaseNumber || "this purchase"}?`)) return;
    try {
      await deletePurchase(id).unwrap();
      toast.success("Deleted");
      navigate("/purchases");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  if (isLoading) {
    return (
      <div className="client-profile">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!purchase) {
    return (
      <EmptyState title="Purchase not found" message="This purchase does not exist or was deleted." />
    );
  }

  const items = purchase.items || [];
  const vendorName = purchase.supplierName || supplier?.name || `Vendor #${purchase.supplierId}`;
  const vendorPhone = supplier?.phone || "";
  const vendorCompany = supplier?.companyName || "";
  const callHref = phoneHref(vendorPhone);
  const currency = "Rs";
  const hasDiscount = money(purchase.discount) > 0 || items.some((item) => money(item.discount) > 0);
  const hasTax = money(purchase.tax) > 0 || items.some((item) => money(item.tax) > 0);
  const units = items.reduce((sum, item) => sum + money(item.quantity), 0);
  const place = [vendorCompany, formatInvoiceDate(purchase.purchaseDate)].filter(Boolean).join(" · ");

  return (
    <div className="client-profile">
      <article className="client-record purchase-record">
        <div className="client-record-toolbar no-print">
          <button
            type="button"
            className="client-record-back"
            onClick={() => navigate("/purchases")}
          >
            <FontAwesomeIcon icon={faAngleLeft} size="2xs" />
            Purchases
          </button>
          <div className="client-record-actions">
            {isDraft && (
              <Can permission={PERMISSIONS.PURCHASES_UPDATE}>
                <Link to={`/purchases/${id}/edit`} className="btn edit py-2 px-3">
                  <FontAwesomeIcon icon={faPen} />
                  Edit
                </Link>
              </Can>
            )}
            {isDraft && (
              <Can permission={PERMISSIONS.PURCHASES_CONFIRM}>
                <button type="button" className="btn save-changes py-2 px-3" onClick={onConfirm}>
                  <FontAwesomeIcon icon={faCheck} />
                  Confirm
                </button>
              </Can>
            )}
            {isDraft && (
              <Can permission={PERMISSIONS.PURCHASES_UPDATE}>
                <button type="button" className="btn cancel py-2 px-3" onClick={onCancel}>
                  Cancel
                </button>
              </Can>
            )}
            {!isConfirmed && (
              <Can permission={PERMISSIONS.PURCHASES_DELETE}>
                <button type="button" className="btn delete py-2 px-3" onClick={onDelete}>
                  Delete
                </button>
              </Can>
            )}
          </div>
        </div>

        <header className="client-record-letterhead">
          <div className="client-record-brand">
            <span className="client-record-mark" aria-hidden="true">
              {vendorInitials(vendorName)}
            </span>
            <div className="min-w-0">
              {purchase.supplierId != null ? (
                <h1>
                  <Link to={`/vendors/${purchase.supplierId}`} className="purchase-record-vendor">
                    {vendorName}
                  </Link>
                </h1>
              ) : (
                <h1>{vendorName}</h1>
              )}
              {place ? <p>{place}</p> : null}
              {callHref ? (
                <a href={callHref}>{vendorPhone}</a>
              ) : vendorPhone ? (
                <p>{vendorPhone}</p>
              ) : null}
            </div>
          </div>
          <div className="client-record-doctype">
            <span>Purchase order</span>
            <strong>#{purchase.purchaseNumber}</strong>
          </div>
        </header>

        <section className="client-record-stats" aria-label="Purchase summary">
          <div>
            <span>Status</span>
            <strong>{statusLabel(purchase.status)}</strong>
          </div>
          <div>
            <span>Quantity</span>
            <strong>{units || "—"}</strong>
          </div>
          <div>
            <span>{isConfirmed ? "Remaining" : "Grand total"}</span>
            <strong>
              {formatAmount(currency, isConfirmed ? purchase.remainingAmount : purchase.grandTotal)}
            </strong>
          </div>
        </section>

        <section className="purchase-record-items">
          <div className="invoice-doc-items-head">
            <h2>Items</h2>
            <span className="invoice-doc-count">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {!items.length ? (
            <EmptyState
              className="!border-0 !bg-transparent !shadow-none"
              title="No line items"
              message="This purchase has no products yet."
            />
          ) : (
            <div className="invoice-doc-table-wrap">
              <table className="invoice-doc-table purchase-doc-table">
                <thead>
                  <tr>
                    <th className="is-index">#</th>
                    <th>Item</th>
                    <th className="is-num">Qty</th>
                    <th className="is-num">Cost</th>
                    {hasDiscount ? <th className="is-num">Disc.</th> : null}
                    {hasTax ? <th className="is-num">Tax</th> : null}
                    <th className="is-num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.productId}-${index}`}>
                      <td className="is-index">{index + 1}</td>
                      <td>
                        <span className="invoice-doc-item-name">
                          {item.productNameSnapshot || `Product #${item.productId}`}
                        </span>
                        {item.skuSnapshot ? (
                          <span className="invoice-doc-muted">{item.skuSnapshot}</span>
                        ) : (
                          <span className="invoice-doc-muted">
                            {item.quantity} × {formatAmount(currency, item.unitCost)}
                          </span>
                        )}
                      </td>
                      <td className="is-num">{item.quantity}</td>
                      <td className="is-num">{formatAmount(currency, item.unitCost)}</td>
                      {hasDiscount ? (
                        <td className="is-num">{formatAmount(currency, item.discount)}</td>
                      ) : null}
                      {hasTax ? (
                        <td className="is-num">{formatAmount(currency, item.tax)}</td>
                      ) : null}
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
                {hasDiscount || hasTax ? (
                  <div className="invoice-doc-totals-row">
                    <span>Subtotal</span>
                    <strong>{formatAmount(currency, purchase.subtotal)}</strong>
                  </div>
                ) : null}
                {hasDiscount ? (
                  <div className="invoice-doc-totals-row">
                    <span>Discount</span>
                    <strong>{formatAmount(currency, purchase.discount)}</strong>
                  </div>
                ) : null}
                {hasTax ? (
                  <div className="invoice-doc-totals-row">
                    <span>Tax</span>
                    <strong>{formatAmount(currency, purchase.tax)}</strong>
                  </div>
                ) : null}
                {isConfirmed ? (
                  <div className="invoice-doc-totals-row">
                    <span>Paid</span>
                    <strong>{formatAmount(currency, purchase.paidAmount)}</strong>
                  </div>
                ) : null}
                <div className="invoice-doc-totals-row is-grand">
                  <span>{isConfirmed ? "Remaining" : "Grand total"}</span>
                  <strong>
                    {formatAmount(
                      currency,
                      isConfirmed ? purchase.remainingAmount : purchase.grandTotal
                    )}
                  </strong>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </article>
    </div>
  );
}
