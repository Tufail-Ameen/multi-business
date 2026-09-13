import { faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSearchListKeyboard } from "../../hooks/useSearchListKeyboard";
import { formatAmount, formatInvoiceDate } from "../../utils/invoice";
import EmptyState from "../ui/EmptyState";

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Placed", value: "placed" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Converted", value: "converted" },
  { label: "Cancelled", value: "cancelled" },
];

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function statusKey(status) {
  return String(status || "").trim().toLowerCase();
}

function statusClass(status) {
  const key = statusKey(status);
  if (key === "converted" || key === "confirmed") return "paid";
  if (key === "placed") return "pending";
  if (key === "cancelled") return "cancelled";
  return "draft";
}

function statusLabel(status) {
  const key = statusKey(status);
  if (key === "placed") return "Placed";
  if (key === "confirmed") return "Confirmed";
  if (key === "converted") return "Converted";
  if (key === "cancelled") return "Cancelled";
  return formatCell(status);
}

function sourceLabel(source) {
  return statusKey(source) === "staff" ? "Staff" : "Store";
}

function matchesQuery(order, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    order.number,
    order.clientName,
    order.clientArea,
    order.clientPhone,
    sourceLabel(order.source),
    order.status,
    formatInvoiceDate(order.placedAt || order.createdAt),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export default function OrderList({
  orders = [],
  isLoading,
  query = "",
  onQueryChange,
  statusFilter = "",
  onStatusChange,
}) {
  const navigate = useNavigate();
  const visibleOrders = useMemo(
    () => orders.filter((order) => matchesQuery(order, query)),
    [orders, query]
  );
  const { activeIndex, onSearchKeyDown, setRowRef, rowId, resultsId, activeRowId } =
    useSearchListKeyboard({
      itemCount: visibleOrders.length,
      resetKey: `${query}:${statusFilter}`,
      idPrefix: "order-search",
      onActivate: (index) => {
        const order = visibleOrders[index];
        if (order?.id != null) navigate(`/orders/${order.id}`);
      },
    });

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!orders.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No orders yet"
        message="When a client places an order from a store link, it will show up here."
      />
    );
  } else if (!visibleOrders.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No matching orders"
        message="Try a different number, client, area, or status."
      />
    );
  } else {
    body = (
      <table
        id={resultsId}
        className="product-table w-full min-w-[56rem] md:min-w-full"
      >
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Number</th>
            <th className="text-left">Date</th>
            <th className="text-left">Client</th>
            <th className="text-left">Area</th>
            <th className="text-left">Source</th>
            <th className="text-left">Amount</th>
            <th className="text-left">Status</th>
            <th className="w-[1%] whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleOrders.map((order, index) => (
            <tr
              key={order.id}
              id={rowId(index)}
              ref={setRowRef(index)}
              className={`is-clickable${activeIndex === index ? " is-keyboard-active" : ""}`}
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              <td className="col-index text-left">{index + 1}</td>
              <td className="table-text-size text-left">
                <Link
                  to={`/orders/${order.id}`}
                  className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                >
                  {order.number}
                </Link>
              </td>
              <td className="cell-muted text-left">
                {formatInvoiceDate(order.placedAt || order.createdAt)}
              </td>
              <td className="table-text-size text-left">
                {order.clientId != null ? (
                  <Link
                    to={`/clients/${order.clientId}`}
                    className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {formatCell(order.clientName)}
                  </Link>
                ) : (
                  formatCell(order.clientName)
                )}
              </td>
              <td className="cell-muted text-left">{formatCell(order.clientArea)}</td>
              <td className="cell-muted text-left">{sourceLabel(order.source)}</td>
              <td className="price text-left">
                {formatAmount(order.currency, order.total)}
              </td>
              <td className="text-left">
                <span className={`status-badge ${statusClass(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </td>
              <td
                className="w-[1%] whitespace-nowrap pl-2 text-right"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="table-actions inline-flex justify-end">
                  <Link
                    to={`/orders/${order.id}`}
                    className="btn btn-table-edit"
                    title="View order"
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="form-card product-list-card client-list-card">
      <div className="client-list-toolbar flex flex-col gap-3 border-b border-[var(--color-border)] px-3 py-3 sm:flex-row sm:items-center">
        <input
          type="search"
          className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
          placeholder="Search number, client, area, or status…"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={onSearchKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visibleOrders.length > 0}
          aria-controls={resultsId}
          aria-activedescendant={activeRowId}
          aria-label="Search orders"
        />
        <select
          className="form-select input-settings h-10 w-full rounded-[10px] sm:w-auto"
          value={statusFilter}
          onChange={(event) => onStatusChange?.(event.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
