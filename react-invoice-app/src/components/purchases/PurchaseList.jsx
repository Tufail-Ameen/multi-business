import { faEye, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Can } from "../../auth/guards";
import { useSearchListKeyboard } from "../../hooks/useSearchListKeyboard";
import { PERMISSIONS } from "../../lib/permissions";
import { formatAmount, formatInvoiceDate } from "../../utils/invoice";
import EmptyState from "../ui/EmptyState";

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Cancelled", value: "CANCELLED" },
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

function matchesQuery(purchase, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    purchase.purchaseNumber,
    purchase.supplierName,
    purchase.supplierId,
    purchase.purchaseDate,
    purchase.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export default function PurchaseList({
  purchases = [],
  isLoading,
  query = "",
  onQueryChange,
  statusFilter = "",
  onStatusChange,
  onDelete,
}) {
  const navigate = useNavigate();
  const visiblePurchases = useMemo(
    () => purchases.filter((purchase) => matchesQuery(purchase, query)),
    [purchases, query]
  );
  const { activeIndex, onSearchKeyDown, setRowRef, rowId, resultsId, activeRowId } =
    useSearchListKeyboard({
      itemCount: visiblePurchases.length,
      resetKey: `${query}:${statusFilter}`,
      idPrefix: "purchase-search",
      onActivate: (index) => {
        const purchase = visiblePurchases[index];
        if (purchase?.id != null) navigate(`/purchases/${purchase.id}`);
      },
    });

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!purchases.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No purchases yet"
        message="Create a draft purchase order to get started."
      />
    );
  } else if (!visiblePurchases.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No matching purchases"
        message="Try a different number, vendor, date, or status."
      />
    );
  } else {
    body = (
      <table
        id={resultsId}
        className="product-table w-full min-w-[52rem] md:min-w-full"
      >
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Number</th>
            <th className="text-left">Date</th>
            <th className="text-left">Vendor</th>
            <th className="text-left">Amount</th>
            <th className="text-left">Remaining</th>
            <th className="text-left">Status</th>
            <th className="w-[1%] whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visiblePurchases.map((purchase, index) => {
            const confirmed = statusKey(purchase.status) === "confirmed";
            const vendor = purchase.supplierName || `Vendor #${purchase.supplierId}`;
            return (
              <tr
                key={purchase.id}
                id={rowId(index)}
                ref={setRowRef(index)}
                className={activeIndex === index ? "is-keyboard-active" : undefined}
              >
                <td className="col-index text-left">{index + 1}</td>
                <td className="table-text-size text-left">
                  <Link
                    to={`/purchases/${purchase.id}`}
                    className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                  >
                    {purchase.purchaseNumber}
                  </Link>
                </td>
                <td className="cell-muted text-left">
                  {formatInvoiceDate(purchase.purchaseDate)}
                </td>
                <td className="table-text-size text-left">
                  {purchase.supplierId != null ? (
                    <Link
                      to={`/vendors/${purchase.supplierId}`}
                      className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                    >
                      {formatCell(vendor)}
                    </Link>
                  ) : (
                    formatCell(vendor)
                  )}
                </td>
                <td className="price text-left">{formatAmount("Rs", purchase.grandTotal)}</td>
                <td className="cell-muted text-left">
                  {formatAmount("Rs", purchase.remainingAmount)}
                </td>
                <td className="text-left">
                  <span className={`status-badge ${statusClass(purchase.status)}`}>
                    {statusLabel(purchase.status)}
                  </span>
                </td>
                <td className="w-[1%] whitespace-nowrap pl-2 text-right">
                  <div className="table-actions inline-flex justify-end">
                    <Link
                      to={`/purchases/${purchase.id}`}
                      className="btn btn-table-edit"
                      title="View purchase"
                    >
                      <FontAwesomeIcon icon={faEye} />
                      View
                    </Link>
                    {!confirmed ? (
                      <Can permission={PERMISSIONS.PURCHASES_DELETE}>
                        <button
                          type="button"
                          className="btn btn-table-remove"
                          onClick={() => onDelete?.(purchase)}
                          title="Delete purchase"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          Remove
                        </button>
                      </Can>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
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
          placeholder="Search number, vendor, or date…"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={onSearchKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visiblePurchases.length > 0}
          aria-controls={resultsId}
          aria-activedescendant={activeRowId}
          aria-label="Search purchases"
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
