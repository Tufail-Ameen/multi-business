import { faCirclePlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import EmptyState from "../components/ui/EmptyState";
import FilterMenu from "../components/ui/FilterMenu";
import StatusBadge from "../components/ui/StatusBadge";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetPurchasesQuery } from "../services/invoiceApi";
import { formatAmount } from "../utils/invoice";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "DRAFT", value: "DRAFT" },
  { label: "CONFIRMED", value: "CONFIRMED" },
  { label: "CANCELLED", value: "CANCELLED" },
];

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("");

  const params = { limit: 100 };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, isError, error } = useGetPurchasesQuery(params);
  const purchases = data?.purchases || [];

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load purchases"));
  }, [isError, error]);

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <p className="count-invoices-tect mb-0">
          There are {purchases.length} total Purchases
        </p>

        <div className="invoices-header-actions">
          <FilterMenu
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />

          <Can permission={PERMISSIONS.PURCHASES_CREATE}>
            <Link to="/purchases/new" className="btn new-invoice">
              <span className="circle-plus me-2">
                <FontAwesomeIcon icon={faCirclePlus} />
              </span>
              New Purchase
            </Link>
          </Can>
        </div>
      </div>

      {isLoading ? (
        <p className="textcklr mt-4">Loading…</p>
      ) : !purchases.length ? (
        <EmptyState
          title="No purchases yet"
          message="Create a draft purchase order to get started."
        />
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="invoice-row datalist cursor m-0 grid grid-cols-12 items-center px-2 py-3"
              onClick={() => navigate(`/purchases/${purchase.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/purchases/${purchase.id}`);
              }}
            >
              <div className="table-text-size col-span-12 md:col-span-2">
                <span className="hash-clr">#</span>
                {purchase.purchaseNumber}
              </div>
              <div className="textcklr col-span-12 text-sm md:col-span-3">
                {purchase.supplierName || `Supplier #${purchase.supplierId}`}
              </div>
              <div className="textcklr col-span-6 text-sm md:col-span-2">
                {purchase.purchaseDate
                  ? new Date(purchase.purchaseDate).toLocaleDateString()
                  : "—"}
              </div>
              <div className="price col-span-6 md:col-span-2">
                {formatAmount("Rs", purchase.grandTotal)}
              </div>
              <div className="col-span-12 mt-2 flex md:col-span-3 md:mt-0 md:justify-end">
                <StatusBadge status={purchase.status} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
