import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import OrderList from "../components/orders/OrderList";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetOrdersQuery } from "../services/invoiceApi";

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const params = { per_page: 100 };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, isError, error } = useGetOrdersQuery(params);
  const orders = data?.orders || [];

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load orders"));
  }, [isError, error]);

  return (
    <div className="clients-page mx-auto w-full max-w-6xl">
      <section className="clients-page-section">
        <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="product-list-heading mb-1 !text-[1.35rem] !font-extrabold">
              Orders
            </h1>
            <p className="textcklr small mb-0">
              Track store and staff orders, then convert them to invoices.
            </p>
          </div>
        </div>

        <OrderList
          orders={orders}
          isLoading={isLoading}
          query={query}
          onQueryChange={setQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
        />
      </section>
    </div>
  );
}
