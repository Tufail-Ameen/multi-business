import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
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

function statusClass(status) {
  const key = statusKey(status);
  if (key === "confirmed") return "paid";
  if (key === "cancelled") return "cancelled";
  return "draft";
}

function statusLabel(status) {
  const key = statusKey(status);
  if (key === "confirmed") return "Confirmed";
  if (key === "cancelled") return "Cancelled";
  return "Draft";
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
      <div className="invoice-doc">
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
  const currency = "Rs";

  return (
    <div className="invoice-doc">
      <div className="invoice-doc-nav no-print">
        <button
          type="button"
          className="back-link invoice-doc-back"
          onClick={() => navigate("/purchases")}
        >
          <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
          Purchases
        </button>
        <div className="invoice-doc-actions">
          {isDraft && (
            <Can permission={PERMISSIONS.PURCHASES_UPDATE}>
              <Link to={`/purchases/${id}/edit`} className="btn edit py-2 px-3">
                Edit
              </Link>
            </Can>
          )}
          {isDraft && (
            <Can permission={PERMISSIONS.PURCHASES_CONFIRM}>
              <button type="button" className="btn save-changes py-2 px-3" onClick={onConfirm}>
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

      {isDraft ? (
        <p className="invoice-doc-note no-print">
          Stock increases only when you confirm this purchase.
        </p>
      ) : null}

      <article className="invoice-doc-sheet">
        <header className="invoice-doc-hero">
          <div>
            <p className="invoice-doc-kicker">Purchase</p>
            <div className="invoice-doc-title-row">
              <h1>#{purchase.purchaseNumber}</h1>
              <span className={`status-badge ${statusClass(purchase.status)}`}>
                {statusLabel(purchase.status)}
              </span>
            </div>
          </div>
          <div className="invoice-doc-hero-amount">
            <span>{isConfirmed ? "Remaining" : "Grand total"}</span>
            <strong>
              {formatAmount(currency, isConfirmed ? purchase.remainingAmount : purchase.grandTotal)}
            </strong>
          </div>
        </header>

        <section className="invoice-doc-meta">
          <div>
            <span className="invoice-doc-label">Vendor</span>
            {purchase.supplierId != null ? (
              <Link to={`/vendors/${purchase.supplierId}`} className="invoice-doc-client">
                {vendorName}
              </Link>
            ) : (
              <span className="invoice-doc-client">{vendorName}</span>
            )}
            {vendorPhone ? <p className="invoice-doc-muted">{vendorPhone}</p> : null}
          </div>
          <div>
            <span className="invoice-doc-label">Purchase date</span>
            <p className="invoice-doc-value">{formatInvoiceDate(purchase.purchaseDate)}</p>
          </div>
          <div>
            <span className="invoice-doc-label">Notes</span>
            <p className="invoice-doc-value">{purchase.notes || "—"}</p>
          </div>
        </section>

        <section className="invoice-doc-items">
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
              <table className="invoice-doc-table">
                <thead>
                  <tr>
                    <th className="is-index">#</th>
                    <th>Item</th>
                    <th className="is-num">Qty</th>
                    <th className="is-num">Cost</th>
                    <th className="is-num">Discount</th>
                    <th className="is-num">Tax</th>
                    <th className="is-num">Total</th>
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
                      </td>
                      <td className="is-num">{item.quantity}</td>
                      <td className="is-num">{formatAmount(currency, item.unitCost)}</td>
                      <td className="is-num">{formatAmount(currency, item.discount)}</td>
                      <td className="is-num">{formatAmount(currency, item.tax)}</td>
                      <td className="is-num is-total">{formatAmount(currency, item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {items.length ? (
            <>
              <div className="invoice-doc-totals">
                <div className="invoice-doc-totals-card">
                  <div className="invoice-doc-totals-row">
                    <span>Subtotal</span>
                    <strong>{formatAmount(currency, purchase.subtotal)}</strong>
                  </div>
                  <div className="invoice-doc-totals-row">
                    <span>Discount</span>
                    <strong>{formatAmount(currency, purchase.discount)}</strong>
                  </div>
                  <div className="invoice-doc-totals-row">
                    <span>Tax</span>
                    <strong>{formatAmount(currency, purchase.tax)}</strong>
                  </div>
                  <div className="invoice-doc-totals-row">
                    <span>Paid</span>
                    <strong>{formatAmount(currency, purchase.paidAmount)}</strong>
                  </div>
                </div>
              </div>
              <div className="invoice-doc-due">
                <span>Remaining</span>
                <strong>{formatAmount(currency, purchase.remainingAmount)}</strong>
              </div>
            </>
          ) : null}
        </section>
      </article>
    </div>
  );
}
