import { faCheck, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Can } from "../../auth/guards";
import { PERMISSIONS } from "../../lib/permissions";
import { formatAmount, invoiceClientArea } from "../../utils/invoice";
import EmptyState from "../ui/EmptyState";

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Cancelled", value: "cancelled" },
];

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function statusClass(status) {
  const key = String(status || "").trim().toLowerCase();
  if (key === "paid") return "paid";
  if (key === "pending") return "pending";
  if (key === "cancelled") return "cancelled";
  return "draft";
}

function matchesQuery(invoice, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    invoice.number,
    invoice.clientName,
    invoiceClientArea(invoice),
    invoice.issueDate,
    invoice.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export default function InvoiceList({
  invoices = [],
  isLoading,
  query = "",
  onQueryChange,
  statusFilter = "",
  onStatusChange,
  onDelete,
  onMarkPaid,
  onEdit,
}) {
  const navigate = useNavigate();
  const visibleInvoices = useMemo(
    () => invoices.filter((invoice) => matchesQuery(invoice, query)),
    [invoices, query]
  );

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!invoices.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No invoices yet"
        message="Create a new invoice to get started."
      />
    );
  } else if (!visibleInvoices.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No matching invoices"
        message="Try a different number, client, area, or date."
      />
    );
  } else {
    body = (
      <table className="product-table w-full min-w-[60rem] md:min-w-full">
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Number</th>
            <th className="text-left">Date</th>
            <th className="text-left">Client</th>
            <th className="text-left">Area</th>
            <th className="text-left">Amount</th>
            <th className="text-left">Status</th>
            <th className="w-[1%] whitespace-nowrap text-left">Make as Paid</th>
            <th className="w-[1%] whitespace-nowrap text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleInvoices.map((invoice, index) => {
            const status = String(invoice.status).toLowerCase();
            const paid = status === "paid";
            const canEdit = !paid;
            const canMarkPaid = status === "draft" || status === "pending";
            return (
              <tr
                key={invoice.id}
                className="is-clickable"
                onClick={() => navigate(`/invoices/${invoice.id}`)}
              >
                <td className="col-index text-left">{index + 1}</td>
                <td className="table-text-size text-left">
                  <Link
                    to={`/invoices/${invoice.id}`}
                    className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                  >
                    {invoice.number}
                  </Link>
                </td>
                <td className="cell-muted text-left">{formatCell(invoice.issueDate)}</td>
                <td className="table-text-size text-left">
                  {formatCell(invoice.clientName)}
                </td>
                <td className="cell-muted text-left">
                  {formatCell(invoiceClientArea(invoice))}
                </td>
                <td className="price text-left">
                  {formatAmount(invoice.currency, invoice.total)}
                </td>
                <td className="text-left">
                  <span className={`status-badge ${statusClass(invoice.status)}`}>
                    {formatCell(invoice.status)}
                  </span>
                </td>
                <td
                  className="w-[1%] whitespace-nowrap text-left"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Can permission={PERMISSIONS.INVOICES_CHANGE_STATUS}>
                    <button
                      type="button"
                      className="btn btn-table-paid"
                      onClick={() => onMarkPaid?.(invoice)}
                      disabled={!canMarkPaid}
                      title={
                        canMarkPaid
                          ? "Make as paid"
                          : paid
                            ? "Already paid"
                            : "Only pending invoices can be marked paid"
                      }
                    >
                      <FontAwesomeIcon icon={faCheck} />
                      Make as Paid
                    </button>
                  </Can>
                </td>
                <td
                  className="w-[1%] whitespace-nowrap text-left"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="table-actions inline-flex justify-start">
                    <Can permission={PERMISSIONS.INVOICES_UPDATE}>
                      <button
                        type="button"
                        className="btn btn-table-edit"
                        onClick={() => onEdit?.(invoice)}
                        disabled={!canEdit}
                        title={canEdit ? "Edit invoice" : "Paid invoices cannot be edited"}
                      >
                        <FontAwesomeIcon icon={faPen} />
                        Edit
                      </button>
                    </Can>
                    <Can permission={PERMISSIONS.INVOICES_DELETE}>
                      <button
                        type="button"
                        className="btn btn-table-remove"
                        onClick={() => onDelete?.(invoice)}
                        disabled={paid}
                        title={paid ? "Paid invoices cannot be deleted" : "Delete invoice"}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                        Remove
                      </button>
                    </Can>
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
          placeholder="Search number, client, area, or date…"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          aria-label="Search invoices"
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
