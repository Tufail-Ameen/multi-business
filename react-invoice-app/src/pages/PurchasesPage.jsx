import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import { useAuth } from "../auth/AuthContext";
import PurchaseList from "../components/purchases/PurchaseList";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useDeletePurchaseMutation,
  useGetPurchasesQuery,
} from "../services/invoiceApi";

export default function PurchasesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const { can } = useAuth();

  const params = { limit: 100 };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, isError, error } = useGetPurchasesQuery(params);
  const purchases = data?.purchases || [];
  const [deletePurchase] = useDeletePurchaseMutation();

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load purchases"));
  }, [isError, error]);

  const onDelete = async (purchase) => {
    if (!can(PERMISSIONS.PURCHASES_DELETE)) return;
    if (String(purchase.status).toUpperCase() === "CONFIRMED") return;
    if (!window.confirm(`Delete ${purchase.purchaseNumber}?`)) return;
    try {
      await deletePurchase(purchase.id).unwrap();
      toast.success("Deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Delete failed"));
    }
  };

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              Purchases
            </h1>
            <p className="textcklr small mb-0">
              Create purchase orders and confirm them to update stock.
            </p>
          </div>
          <Can permission={PERMISSIONS.PURCHASES_CREATE}>
            <Link to="/purchases/new" className="btn save-changes w-full py-2 px-3 sm:w-auto text-center">
              New purchase
            </Link>
          </Can>
        </div>

        <PurchaseList
          purchases={purchases}
          isLoading={isLoading}
          query={query}
          onQueryChange={setQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          onDelete={onDelete}
        />
      </section>
    </div>
  );
}
