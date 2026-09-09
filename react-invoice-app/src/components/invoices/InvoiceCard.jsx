import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "react-router-dom";
import { formatAmount } from "../../utils/invoice";
import StatusBadge from "../ui/StatusBadge";

export default function InvoiceCard({ invoice }) {
  const navigate = useNavigate();

  return (
    <div className="invoice-card" onClick={() => navigate(`/invoices/${invoice.id}`)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="hash-clr fw-semibold">#{invoice.number}</span>
        <StatusBadge status={invoice.status} compact />
      </div>
      <p className="mb-2 fw-semibold">{invoice.clientName}</p>
      <div className="flex items-end justify-between">
        <div>
          <div className="textcklr mb-1 table-text-size">{invoice.issueDate}</div>
          <div className="price">{formatAmount(invoice.currency, invoice.total)}</div>
        </div>
        <span className="down-icon">
          <FontAwesomeIcon icon={faChevronRight} />
        </span>
      </div>
    </div>
  );
}
