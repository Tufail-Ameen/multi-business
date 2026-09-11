import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import FilterMenu from "../components/ui/FilterMenu";
import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/ui/StatusBadge";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetOrdersQuery } from "../services/invoiceApi";
import { formatAmount } from "../utils/invoice";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Placed", value: "placed" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Converted", value: "converted" },
  { label: "Cancelled", value: "cancelled" },
];

export default function OrdersPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("");
  const params = { per_page: 100 };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, isError, error } = useGetOrdersQuery(params);
  const orders = data?.orders || [];

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load orders"));
  }, [isError, error]);

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <p className="count-invoices-tect mb-0">
          There are {orders.length} total Orders
        </p>
        <div className="invoices-header-actions">
          <FilterMenu
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="textcklr mt-4">Loading…</p>
      ) : !orders.length ? (
        <EmptyState
          title="No orders yet"
          message="When a client places an order from a store link, it will show up here."
        />
      ) : (
        <div className="hidden md:block">
          {orders.map((order) => (
            <div
              key={order.id}
              className="invoice-row datalist cursor mt-3 grid grid-cols-12 py-3 ps-3"
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              <div className="position-table table-text-size md:col-span-2">
                <span className="hash-clr">#</span>
                {order.number}
              </div>
              <div className="position-table table-text-size textcklr md:col-span-3">
                {order.clientName}
              </div>
              <div className="table-text-size textcklr md:col-span-2">
                {order.source === "store" ? "Store" : "Staff"}
              </div>
              <div className="price md:col-span-2">
                {formatAmount(order.currency, order.total)}
              </div>
              <div className="position-table-btn p-0 md:col-span-2">
                <StatusBadge status={order.status} />
              </div>
              <div className="position-table goicon-position m-0 p-0 md:col-span-1">
                <span className="down-icon goicon">
                  <FontAwesomeIcon icon={faChevronRight} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && orders.length ? (
        <div className="block md:hidden mt-3">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              className="invoice-row datalist cursor mb-3 w-full p-3 text-left"
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              <div className="flex items-center justify-between gap-2">
                <strong>#{order.number}</strong>
                <StatusBadge status={order.status} compact />
              </div>
              <p className="textcklr mb-0 mt-2">{order.clientName}</p>
              <p className="price mb-0 mt-1">{formatAmount(order.currency, order.total)}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
