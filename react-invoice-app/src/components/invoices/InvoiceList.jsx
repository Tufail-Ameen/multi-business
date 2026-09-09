import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "react-router-dom";
import { formatAmount } from "../../utils/invoice";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import InvoiceCard from "./InvoiceCard";

export default function InvoiceList({ invoices }) {
  const navigate = useNavigate();

  const openInvoice = (invoice) => {
    navigate(`/invoices/${invoice.id}`);
  };

  if (!invoices.length) {
    return (
      <EmptyState title="No invoices yet" message="Create a new invoice to get started." />
    );
  }

  return (
    <>
      <div className="hidden md:block">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="invoice-row datalist cursor mt-3 grid grid-cols-12 py-3 ps-3"
            onClick={() => openInvoice(invoice)}
          >
            <div className="position-table table-text-size md:col-span-2">
              <span className="hash-clr">#</span>
              {invoice.number}
            </div>
            <div className="position-table table-text-size textcklr md:col-span-2">
              {invoice.issueDate}
            </div>
            <div className="table-text-size textcklr md:col-span-3">
              {invoice.clientName}
            </div>
            <div className="price md:col-span-2">
              {formatAmount(invoice.currency, invoice.total)}
            </div>
            <div className="position-table-btn p-0 md:col-span-2">
              <StatusBadge status={invoice.status} />
            </div>
            <div className="position-table goicon-position m-0 p-0 md:col-span-1">
              <span className="down-icon goicon">
                <FontAwesomeIcon icon={faChevronRight} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="block md:hidden">
        {invoices.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} />
        ))}
      </div>
    </>
  );
}
