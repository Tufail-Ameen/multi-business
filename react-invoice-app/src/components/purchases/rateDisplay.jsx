import { Link } from "react-router-dom";
import { formatAmount, formatInvoiceDate } from "../../utils/invoice";

export function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export function formatRate(value) {
  if (value === null || value === undefined || value === "") return "—";
  return formatAmount("Rs", value);
}

export function VendorRateCell({ vendor, tone }) {
  if (!vendor) return "—";
  return (
    <div className={`vendor-rate-cell${tone ? ` is-${tone}` : ""}`}>
      <Link to={`/vendors/${vendor.supplierId}`} className="vendor-rate-name">
        {vendor.supplierName}
      </Link>
      <div className="vendor-rate-amount">{formatRate(vendor.unitPrice)}</div>
    </div>
  );
}

export function formatRateDate(value) {
  return formatInvoiceDate(value);
}

export function RateChange({ diff, change }) {
  if (diff == null && !change) {
    return <span className="cell-muted">—</span>;
  }
  const key = change || (diff > 0 ? "up" : diff < 0 ? "down" : "same");
  if (key === "same" || diff === 0) {
    return <span className="rate-change is-same">Same</span>;
  }
  const amount = formatAmount("Rs", Math.abs(diff));
  if (key === "down") {
    return <span className="rate-change is-down">↓ {amount}</span>;
  }
  return <span className="rate-change is-up">↑ {amount}</span>;
}
