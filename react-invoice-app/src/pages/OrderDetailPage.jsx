import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/ui/StatusBadge";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useConvertOrderMutation,
  useGetOrderQuery,
  useUpdateOrderMutation,
} from "../services/invoiceApi";
import { formatAmount } from "../utils/invoice";

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
      <div className="page-wrap">
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

  return (
    <div className="page-wrap invoice-detail">
      <button type="button" className="back-link" onClick={() => navigate("/orders")}>
        <FontAwesomeIcon className="icon me-2" icon={faAngleLeft} size="2xs" />
        Go back
      </button>

      <div className="detail-toolbar">
        <div className="flex items-center gap-3">
          <span className="edit-discription mb-0">Status</span>
          <StatusBadge status={order.status} />
        </div>
        <div className="detail-actions">
          {status === "placed" && (
            <Can permission={PERMISSIONS.ORDERS_UPDATE}>
              <button
                type="button"
                className="btn edit py-2 px-3"
                disabled={updateState.isLoading}
                onClick={() => setStatus("confirmed")}
              >
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
                Convert to invoice
              </button>
            </Can>
          )}
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

      <div className="detail-card">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <p className="edit-id">#{order.number}</p>
            <p className="edit-discription mb-0">
              {order.source === "store" ? "Store order" : "Staff order"}
              {order.rateListNumber ? ` · ${order.rateListNumber}` : ""}
            </p>
            {order.notes ? <p className="textcklr mt-2 mb-0">{order.notes}</p> : null}
          </div>
          <div className="col-span-12 md:col-span-6 md:text-end">
            <span className="edit-discription block">Client</span>
            <span className="date-bill-email block">{order.clientName}</span>
            <span className="textcklr block">{snap.phone || order.clientPhone || "—"}</span>
            {order.convertedInvoiceId ? (
              <button
                type="button"
                className="btn edit mt-3 py-2 px-3"
                onClick={() => navigate(`/invoices/${order.convertedInvoiceId}`)}
              >
                Open invoice
              </button>
            ) : null}
          </div>
        </div>

        <div className="table-setting my-4 overflow-x-auto">
          <table className="table m-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Qty.</th>
                <th>Rate</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((item, index) => (
                <tr key={`${item.productId}-${item.name}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>{formatAmount(order.currency || "Rs", item.unitPrice)}</td>
                  <td>{formatAmount(order.currency || "Rs", item.lineTotal)}</td>
                </tr>
              ))}
              <tr className="total">
                <th className="py-4 px-2" colSpan={4}>
                  Amount
                </th>
                <th className="total-price">{formatAmount(order.currency || "Rs", order.total)}</th>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
