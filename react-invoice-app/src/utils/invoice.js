export function calcLineTotal(quantity, price, tax) {
  const total = (Number(quantity) || 0) * (Number(price) || 0);
  const taxPercentage = (Number(tax) || 0) / 100;
  return total + total * taxPercentage;
}

export function formatAmount(currency, amount) {
  return `${currency || ""} ${(Number(amount) || 0).toFixed(0)}`.trim();
}
