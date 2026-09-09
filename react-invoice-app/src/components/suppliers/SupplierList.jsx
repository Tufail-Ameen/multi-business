import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import { Can } from "../../auth/guards";
import { useSuppliers } from "../../hooks/useSuppliers";
import { formatAmount } from "../../utils/invoice";
import { Link } from "react-router-dom";

/**
 * Suppliers list — data GET /suppliers se aati hai (useSuppliers hook).
 */
export default function SupplierList({
  onEdit,
  onDelete,
  canEditPermission,
  canDeletePermission,
}) {
  const { suppliers, isLoading } = useSuppliers();

  if (isLoading) {
    return <p className="textcklr">Loading…</p>;
  }

  if (!suppliers.length) {
    return (
      <EmptyState title="No suppliers yet" message="Add a supplier to record purchases." />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {suppliers.map((supplier) => (
        <div
          key={supplier.key || supplier._id || supplier.id}
          className="invoice-row datalist m-0 grid grid-cols-12 items-center px-2 py-3"
        >
          <div className="table-text-size col-span-12 md:col-span-3">{supplier.name}</div>
          <div className="textcklr col-span-12 text-sm md:col-span-2">{supplier.phone || "—"}</div>
          <div className="col-span-6 mt-2 md:col-span-2 md:mt-0">
            <StatusBadge status={supplier.status} compact />
          </div>
          <div className="price col-span-6 mt-2 md:col-span-2 md:mt-0">
            {formatAmount("Rs", supplier.currentBalance)}
          </div>
          <div className="col-span-12 mt-2 flex flex-wrap gap-2 md:col-span-3 md:mt-0 md:justify-end">
            <Link
              to={`/suppliers/${supplier.id}`}
              className="btn edit py-1 px-3"
            >
              View
            </Link>
            {canEditPermission ? (
              <Can permission={canEditPermission}>
                <button
                  type="button"
                  className="btn edit py-1 px-3"
                  onClick={() => onEdit?.(supplier)}
                >
                  Edit
                </button>
              </Can>
            ) : (
              <button
                type="button"
                className="btn edit py-1 px-3"
                onClick={() => onEdit?.(supplier)}
              >
                Edit
              </button>
            )}
            {canDeletePermission ? (
              <Can permission={canDeletePermission}>
                <button
                  type="button"
                  className="btn cancel py-1 px-3"
                  onClick={() => onDelete?.(supplier)}
                >
                  Delete
                </button>
              </Can>
            ) : (
              <button
                type="button"
                className="btn cancel py-1 px-3"
                onClick={() => onDelete?.(supplier)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
