export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function toNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function emptyPurchaseLine() {
  return {
    key: Math.random().toString(36).slice(2),
    productId: "",
    quantity: "",
    unitCost: "",
    lineAmount: "",
    discount: 0,
    tax: 0,
    costSource: "unit",
  };
}

export function purchaseLineFromItem(item) {
  const quantity = item?.quantity ?? "";
  const unitCost = item?.unitCost ?? "";
  const qty = toNumber(quantity);
  const cost = toNumber(unitCost);
  return {
    key: Math.random().toString(36).slice(2),
    productId: item?.productId != null ? String(item.productId) : "",
    quantity,
    unitCost,
    lineAmount: qty && qty > 0 && cost != null ? roundMoney(qty * cost) : "",
    discount: item?.discount ?? 0,
    tax: item?.tax ?? 0,
    costSource: "unit",
  };
}

export function calcPurchaseLineTotal(line) {
  const quantity = toNumber(line.quantity) || 0;
  const unitCost = toNumber(line.unitCost) || 0;
  const discount = toNumber(line.discount) || 0;
  const tax = toNumber(line.tax) || 0;
  return roundMoney(quantity * unitCost - discount + tax);
}

export function patchPurchaseLine(line, field, value) {
  if (field === "quantity") {
    const next = { ...line, quantity: value };
    const qty = toNumber(value);
    const amount = toNumber(line.lineAmount);
    const cost = toNumber(line.unitCost);
    if (qty && qty > 0) {
      if (line.costSource === "total" && amount != null) {
        next.unitCost = roundMoney(amount / qty);
      } else if (cost != null) {
        next.lineAmount = roundMoney(qty * cost);
      }
    }
    return next;
  }

  if (field === "lineAmount") {
    const next = { ...line, lineAmount: value, costSource: "total" };
    const qty = toNumber(line.quantity);
    const amount = toNumber(value);
    if (qty && qty > 0 && amount != null) {
      next.unitCost = roundMoney(amount / qty);
    }
    return next;
  }

  if (field === "unitCost") {
    const next = { ...line, unitCost: value, costSource: "unit" };
    const qty = toNumber(line.quantity);
    const cost = toNumber(value);
    if (qty && qty > 0 && cost != null) {
      next.lineAmount = roundMoney(qty * cost);
    }
    return next;
  }

  return { ...line, [field]: value };
}

export function applyProductCost(line, productId, unitCost) {
  const next = { ...line, productId };
  if (line.costSource === "total" && toNumber(line.lineAmount) != null) {
    return next;
  }
  const cost =
    unitCost === "" || unitCost == null || !Number.isFinite(Number(unitCost))
      ? ""
      : roundMoney(unitCost);
  return patchPurchaseLine({ ...next, costSource: "unit" }, "unitCost", cost);
}

export function summarizePurchaseLines(lines) {
  const lineTotals = lines.map(calcPurchaseLineTotal);
  const subtotal = roundMoney(
    lines.reduce((sum, line) => {
      const qty = toNumber(line.quantity) || 0;
      const cost = toNumber(line.unitCost) || 0;
      return sum + qty * cost;
    }, 0)
  );
  const discount = roundMoney(
    lines.reduce((sum, line) => sum + (toNumber(line.discount) || 0), 0)
  );
  const tax = roundMoney(
    lines.reduce((sum, line) => sum + (toNumber(line.tax) || 0), 0)
  );
  return {
    lineTotals,
    subtotal,
    discount,
    tax,
    grandTotal: roundMoney(subtotal - discount + tax),
  };
}
