import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import { useAuth } from "../auth/AuthContext";
import InvoiceForm from "../components/invoices/InvoiceForm";
import InvoiceList from "../components/invoices/InvoiceList";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useDeleteInvoiceMutation,
  useGetInvoicesQuery,
} from "../services/invoiceApi";

export default function InvoicesPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const { can } = useAuth();

  const params = { per_page: 100 };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, isError, error, refetch } = useGetInvoicesQuery(params);
  const invoices = data?.invoices || [];
  const [deleteInvoice] = useDeleteInvoiceMutation();

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load invoices"));
  }, [isError, error]);

  const onDelete = async (invoice) => {
    if (!can(PERMISSIONS.INVOICES_DELETE)) return;
    if (String(invoice.status).toLowerCase() === "paid") return;
    if (!window.confirm(`Delete ${invoice.number}?`)) return;
    try {
      await deleteInvoice(invoice.id).unwrap();
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
              Invoices
            </h1>
            <p className="textcklr small mb-0">
              Create and manage invoices for billing clients.
            </p>
          </div>
          <Can permission={PERMISSIONS.INVOICES_CREATE}>
            <button
              type="button"
              className="btn save-changes w-full py-2 px-3 sm:w-auto"
              onClick={() => setShowForm(true)}
            >
              New invoice
            </button>
          </Can>
        </div>

        <InvoiceList
          invoices={invoices}
          isLoading={isLoading}
          query={query}
          onQueryChange={setQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          onDelete={onDelete}
        />
      </section>

      {showForm && (
        <InvoiceForm onClose={() => setShowForm(false)} onSaved={() => refetch()} />
      )}
    </div>
  );
}
