import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import PurchaseRateList from "../components/purchases/PurchaseRateList";
import PurchaseTabs from "../components/purchases/PurchaseTabs";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetPurchasePricesQuery } from "../services/invoiceApi";

export default function PurchaseRatesPage() {
  const [query, setQuery] = useState("");
  const { data, isLoading, isError, error } = useGetPurchasePricesQuery();
  const products = data?.products || [];

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load vendor rates"));
  }, [isError, error]);

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              Vendor rates
            </h1>
            <p className="textcklr small mb-0">
              Same product, different vendors — last rate, difference, cheapest and costliest.
            </p>
          </div>
          <Can permission={PERMISSIONS.PURCHASES_CREATE}>
            <Link to="/purchases/new" className="btn save-changes w-full py-2 px-3 sm:w-auto text-center">
              New purchase
            </Link>
          </Can>
        </div>

        <PurchaseTabs />

        <PurchaseRateList
          products={products}
          isLoading={isLoading}
          query={query}
          onQueryChange={setQuery}
        />
      </section>
    </div>
  );
}
