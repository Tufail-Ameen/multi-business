import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/ui/StatusBadge";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCancelPurchaseMutation,
  useConfirmPurchaseMutation,
  useGetPurchaseQuery,
} from "../services/invoiceApi";
import { formatAmount } from "../utils/invoice";

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useGetPurchaseQuery(id);
  const [confirmPurchase] = useConfirmPurchaseMutation();
  const [cancelPurchase] = useCancelPurchaseMutation();

  const purchase = data?.purchase;
  const isDraft = String(purchase?.status || "").toUpperCase() === "DRAFT";

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Purchase not found"));
  }, [isError, error]);

  const onConfirm = async () => {
    if (
      !window.confirm(
        "Confirm this purchase? Stock will increase and a supplier payable will be created."
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

  if (isLoading) {
    return (
      <div className="page-wrap">
        <p className="textcklr">Loading…</p>
      </div>
    );
  }

  if (!purchase) {
    return (
      <EmptyState title="Purchase not found" message="This purchase does not exist or was deleted." />
    );
  }

  return (
    <div className="page-wrap invoice-detail">
      <button type="button" className="back-link" onClick={() => navigate("/purchases")}>
        <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
        Go back
      </button>

      <div className="detail-toolbar">
        <div className="flex items-center gap-3">
          <span className="edit-discription mb-0">Status</span>
          <StatusBadge status={purchase.status} />
        </div>
        <div className="detail-actions">
          {isDraft && (
            <Can permission={PERMISSIONS.PURCHASES_CONFIRM}>
              <button
                type="button"
                className="btn input-clr1 save py-2 px-3"
                onClick={onConfirm}
              >
                Confirm
              </button>
            </Can>
          )}
          {isDraft && (
            <Can permission={PERMISSIONS.PURCHASES_UPDATE}>
              <Link
                to={`/purchases/${id}/edit`}
                className="btn input-clr1 edit py-2 px-3"
              >
                Edit
              </Link>
            </Can>
          )}
          {isDraft && (
            <Can permission={PERMISSIONS.PURCHASES_UPDATE}>
              <button type="button" className="btn cancel py-2 px-3" onClick={onCancel}>
                Cancel
              </button>
            </Can>
          )}
        </div>
      </div>

      {isDraft && (
        <p className="textcklr mb-3 text-sm">
          Stock increases only when you confirm this purchase.
        </p>
      )}

      <div className="detail-card">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <p className="edit-id">#{purchase.purchaseNumber}</p>
            <p className="edit-discription">{purchase.notes || "Purchase order"}</p>
          </div>
          <div className="col-span-12 md:col-span-6 md:text-end">
            <span className="edit-discription block">Supplier</span>
            <span className="date-bill-email block">
              {purchase.supplierName || `#${purchase.supplierId}`}
            </span>
            <span className="edit-discription mt-3 block">Purchase Date</span>
            <span className="date-bill-email block">
              {purchase.purchaseDate
                ? new Date(purchase.purchaseDate).toLocaleDateString()
                : "—"}
            </span>
          </div>
        </div>

        <div className="table-setting my-4 overflow-x-auto">
          <table className="table m-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Cost</th>
                <th>Discount</th>
                <th>Tax</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(purchase.items || []).map((item, index) => (
                <tr key={`${item.productId}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.productNameSnapshot || `Product #${item.productId}`}</td>
                  <td>{item.quantity}</td>
                  <td>{formatAmount("Rs", item.unitCost)}</td>
                  <td>{formatAmount("Rs", item.discount)}</td>
                  <td>{formatAmount("Rs", item.tax)}</td>
                  <td>{formatAmount("Rs", item.lineTotal)}</td>
                </tr>
              ))}
              <tr>
                <th className="py-2" colSpan={6}>
                  Subtotal
                </th>
                <th>{formatAmount("Rs", purchase.subtotal)}</th>
              </tr>
              <tr>
                <th className="py-2" colSpan={6}>
                  Discount
                </th>
                <th>{formatAmount("Rs", purchase.discount)}</th>
              </tr>
              <tr>
                <th className="py-2" colSpan={6}>
                  Tax
                </th>
                <th>{formatAmount("Rs", purchase.tax)}</th>
              </tr>
              <tr className="total">
                <th className="py-4 px-2" colSpan={6}>
                  Grand Total
                </th>
                <th className="total-price">{formatAmount("Rs", purchase.grandTotal)}</th>
              </tr>
              <tr>
                <th className="py-2" colSpan={6}>
                  Paid
                </th>
                <th>{formatAmount("Rs", purchase.paidAmount)}</th>
              </tr>
              <tr>
                <th className="py-2" colSpan={6}>
                  Remaining
                </th>
                <th>{formatAmount("Rs", purchase.remainingAmount)}</th>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
