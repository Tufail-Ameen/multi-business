import { faCirclePlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Can } from "../auth/guards";
import InvoiceForm from "../components/invoices/InvoiceForm";
import InvoiceList from "../components/invoices/InvoiceList";
import FilterMenu from "../components/ui/FilterMenu";
import { PERMISSIONS } from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetInvoicesQuery } from "../services/invoiceApi";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Cancelled", value: "cancelled" },
];

export default function InvoicesPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const params = { per_page: 100 };
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, isError, error, refetch } = useGetInvoicesQuery(params);
  const invoices = data?.invoices || [];

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(error, "Failed to load invoices"));
  }, [isError, error]);

  return (
    <div className="page-wrap">
      <div className="invoices-header">
        <p className="count-invoices-tect mb-0">
          There are {invoices.length} total Invoices
        </p>

        <div className="invoices-header-actions">
          <FilterMenu
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />

          <Can permission={PERMISSIONS.INVOICES_CREATE}>
            <button type="button" className="btn new-invoice" onClick={() => setShowForm(true)}>
              <span className="circle-plus me-2">
                <FontAwesomeIcon icon={faCirclePlus} />
              </span>
              New Invoice
            </button>
          </Can>
        </div>
      </div>

      {isLoading ? <p className="textcklr mt-4">Loading…</p> : <InvoiceList invoices={invoices} />}

      {showForm && (
        <InvoiceForm onClose={() => setShowForm(false)} onSaved={() => refetch()} />
      )}
    </div>
  );
}
