import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Can } from "../../auth/guards";
import { useSuppliers } from "../../hooks/useSuppliers";
import EmptyState from "../ui/EmptyState";

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function statusClass(status) {
  const key = String(status || "").trim().toLowerCase();
  if (key === "active") return "active";
  return "inactive";
}

function statusLabel(status) {
  const key = String(status || "").trim().toUpperCase();
  if (key === "ARCHIVED") return "Archived";
  return "Active";
}

function matchesQuery(supplier, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    supplier.name,
    supplier.companyName,
    supplier.phone,
    supplier.city,
    supplier.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export default function SupplierList({
  query = "",
  onQueryChange,
  onEdit,
  onDelete,
  canEditPermission,
  canDeletePermission,
}) {
  const { suppliers, isLoading } = useSuppliers({ limit: 100 });

  const visibleSuppliers = useMemo(
    () => suppliers.filter((supplier) => matchesQuery(supplier, query)),
    [suppliers, query]
  );

  const editButton = (supplier) => (
    <button
      type="button"
      className="btn btn-table-edit"
      onClick={() => onEdit?.(supplier)}
      title="Edit vendor"
    >
      <FontAwesomeIcon icon={faPen} />
      Edit
    </button>
  );

  const deleteButton = (supplier) => (
    <button
      type="button"
      className="btn btn-table-remove"
      onClick={() => onDelete?.(supplier)}
      title="Remove vendor"
    >
      <FontAwesomeIcon icon={faTrash} />
      Remove
    </button>
  );

  let body = null;
  if (isLoading) {
    body = <p className="textcklr m-0 px-4 py-5">Loading…</p>;
  } else if (!suppliers.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No vendors yet"
        message="Add a vendor to record purchases."
      />
    );
  } else if (!visibleSuppliers.length) {
    body = (
      <EmptyState
        className="!border-0 !bg-transparent !shadow-none"
        title="No matching vendors"
        message="Try a different name, company, phone, or city."
      />
    );
  } else {
    body = (
      <table className="product-table w-full min-w-[52rem] md:min-w-full">
        <thead>
          <tr>
            <th className="col-index text-left">#</th>
            <th className="text-left">Name</th>
            <th className="text-left">Company</th>
            <th className="text-left">Phone</th>
            <th className="text-left">City</th>
            <th className="text-left">Status</th>
            <th className="w-[1%] whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleSuppliers.map((supplier, index) => (
            <tr key={supplier.key || supplier._id || supplier.id}>
              <td className="col-index text-left">{index + 1}</td>
              <td className="table-text-size text-left">
                {supplier.id != null ? (
                  <Link
                    to={`/vendors/${supplier.id}`}
                    className="font-bold text-[var(--color-primary)] no-underline hover:underline"
                  >
                    {formatCell(supplier.name)}
                  </Link>
                ) : (
                  formatCell(supplier.name)
                )}
              </td>
              <td className="cell-muted text-left">{formatCell(supplier.companyName)}</td>
              <td className="cell-muted text-left">{formatCell(supplier.phone)}</td>
              <td className="cell-muted text-left">{formatCell(supplier.city)}</td>
              <td className="text-left">
                <span className={`status-badge ${statusClass(supplier.status)}`}>
                  {statusLabel(supplier.status)}
                </span>
              </td>
              <td className="w-[1%] whitespace-nowrap pl-2 text-right">
                <div className="table-actions inline-flex justify-end">
                  {canEditPermission ? (
                    <Can permission={canEditPermission}>{editButton(supplier)}</Can>
                  ) : (
                    editButton(supplier)
                  )}
                  {canDeletePermission ? (
                    <Can permission={canDeletePermission}>{deleteButton(supplier)}</Can>
                  ) : (
                    deleteButton(supplier)
                  )}
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
      <div className="client-list-toolbar flex items-center border-b border-[var(--color-border)] px-3 py-3">
        <input
          type="search"
          className="form-control input-settings h-10 w-full rounded-[10px] md:max-w-[420px]"
          placeholder="Search name, company, phone, or city…"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          aria-label="Search vendors"
        />
      </div>
      <div className="product-table-scroll client-table-scroll">{body}</div>
    </div>
  );
}
