export const INVOICE_CURRENCY = "Rs";

export function productUnitPrice(product) {
  if (!product) return 0;
  const candidates = [
    product.salePrice,
    product.printRate,
    product.wholesalePrice,
    product.price,
    product.unitPrice,
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function calcLineTotal(quantity, price, tax = 0) {
  const qty = Number(quantity);
  const unit = Number(price);
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safeUnit = Number.isFinite(unit) ? unit : 0;
  const total = safeQty * safeUnit;
  const taxPercentage = (Number(tax) || 0) / 100;
  return Math.round((total + total * taxPercentage) * 100) / 100;
}

export function formatAmount(currency, amount) {
  const n = Math.round(Number(amount) || 0);
  return `${currency || INVOICE_CURRENCY} ${n.toLocaleString("en-US")}`;
}

export function invoiceClientArea(invoice) {
  if (!invoice) return "";
  return invoice.clientArea || invoice.clientSnapshot?.area || "";
}

export function formatInvoiceDate(value) {
  if (value == null || value === "") return "—";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
