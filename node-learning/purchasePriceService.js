/**
 * Vendor purchase-rate intelligence from `supplier_price_history`.
 * Last / previous / min / max / cheapest / costliest are derived, not stored.
 */

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function rateChange(current, previous) {
  if (current == null || previous == null) return null;
  const diff = toMoney(current - previous);
  if (diff > 0) return "up";
  if (diff < 0) return "down";
  return "same";
}

function moneyDiff(current, previous) {
  if (current == null || previous == null) return null;
  return toMoney(current - previous);
}

function supplierName(suppliersById, supplierId) {
  const supplier = suppliersById.get(Number(supplierId));
  return supplier?.name || `Vendor #${supplierId}`;
}

function sortNewest(a, b) {
  const ta = new Date(a.purchasedAt || 0).getTime();
  const tb = new Date(b.purchasedAt || 0).getTime();
  if (tb !== ta) return tb - ta;
  return Number(b.id || 0) - Number(a.id || 0);
}

function pricePoint(row, suppliersById) {
  if (!row) return null;
  return {
    supplierId: row.supplierId,
    supplierName: supplierName(suppliersById, row.supplierId),
    unitPrice: toMoney(row.unitPrice),
    purchasedAt: row.purchasedAt,
    purchaseId: row.purchaseId || null,
    variantId: row.variantId ?? null,
  };
}

function summarizeProductPrices({
  productId,
  product,
  history = [],
  suppliersById = new Map(),
  includeHistory = false,
}) {
  const sorted = [...history].sort(sortNewest);
  const last = sorted[0] || null;
  const previous = sorted[1] || null;

  const bySupplier = new Map();
  for (const row of sorted) {
    const key = Number(row.supplierId);
    if (!bySupplier.has(key)) bySupplier.set(key, []);
    bySupplier.get(key).push(row);
  }

  const vendors = [...bySupplier.entries()]
    .map(([supplierId, rows]) => {
      const lastRow = rows[0];
      const previousRow = rows[1] || null;
      const prices = rows.map((row) => toMoney(row.unitPrice));
      const lastPrice = toMoney(lastRow.unitPrice);
      const previousPrice = previousRow ? toMoney(previousRow.unitPrice) : null;
      return {
        supplierId,
        supplierName: supplierName(suppliersById, supplierId),
        lastPrice,
        previousPrice,
        rateDiff: moneyDiff(lastPrice, previousPrice),
        rateChange: rateChange(lastPrice, previousPrice),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        avgPrice: toMoney(prices.reduce((sum, price) => sum + price, 0) / prices.length),
        purchaseCount: rows.length,
        lastPurchasedAt: lastRow.purchasedAt,
        lastPurchaseId: lastRow.purchaseId || null,
        previousPurchasedAt: previousRow?.purchasedAt || null,
      };
    })
    .sort((a, b) => {
      if (a.lastPrice !== b.lastPrice) return a.lastPrice - b.lastPrice;
      return a.supplierName.localeCompare(b.supplierName);
    });

  const cheapest = vendors[0] || null;
  const mostExpensive = vendors.length ? vendors[vendors.length - 1] : null;
  const lastPrice = last ? toMoney(last.unitPrice) : null;
  const previousPrice = previous ? toMoney(previous.unitPrice) : null;
  const catalogPurchasePrice =
    product?.purchasePrice != null ? toMoney(product.purchasePrice) : null;

  const summary = {
    productId: Number(productId),
    productName: product?.name || `Product #${productId}`,
    sku: product?.sku || null,
    catalogPurchasePrice,
    vendorCount: vendors.length,
    last: pricePoint(last, suppliersById),
    previous: pricePoint(previous, suppliersById),
    rateDiff: moneyDiff(lastPrice, previousPrice),
    rateChange: rateChange(lastPrice, previousPrice),
    cheapest: cheapest
      ? {
          supplierId: cheapest.supplierId,
          supplierName: cheapest.supplierName,
          unitPrice: cheapest.lastPrice,
          purchasedAt: cheapest.lastPurchasedAt,
          purchaseId: cheapest.lastPurchaseId,
        }
      : null,
    mostExpensive: mostExpensive
      ? {
          supplierId: mostExpensive.supplierId,
          supplierName: mostExpensive.supplierName,
          unitPrice: mostExpensive.lastPrice,
          purchasedAt: mostExpensive.lastPurchasedAt,
          purchaseId: mostExpensive.lastPurchaseId,
        }
      : null,
    vendors,
  };

  if (includeHistory) {
    summary.history = sorted.slice(0, 50).map((row) => pricePoint(row, suppliersById));
  }

  return summary;
}

function buildPurchasePriceHints({
  product,
  supplierId,
  history = [],
  suppliersById = new Map(),
}) {
  const summary = summarizeProductPrices({
    productId: product.id,
    product,
    history,
    suppliersById,
  });
  const vendor =
    supplierId != null
      ? summary.vendors.find((row) => Number(row.supplierId) === Number(supplierId))
      : null;

  return {
    productId: product.id,
    catalogPurchasePrice: summary.catalogPurchasePrice,
    lastFromVendor: vendor
      ? {
          supplierId: vendor.supplierId,
          supplierName: vendor.supplierName,
          unitPrice: vendor.lastPrice,
          purchasedAt: vendor.lastPurchasedAt,
          purchaseId: vendor.lastPurchaseId,
        }
      : null,
    previousFromVendor: vendor?.previousPrice != null
      ? {
          supplierId: vendor.supplierId,
          supplierName: vendor.supplierName,
          unitPrice: vendor.previousPrice,
          purchasedAt: vendor.previousPurchasedAt,
        }
      : null,
    vendorRateDiff: vendor?.rateDiff ?? null,
    vendorRateChange: vendor?.rateChange || null,
    cheapest: summary.cheapest,
    mostExpensive: summary.mostExpensive,
    lastAny: summary.last,
    vendors: summary.vendors.map((row) => ({
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      lastPrice: row.lastPrice,
      lastPurchasedAt: row.lastPurchasedAt,
      rateDiff: row.rateDiff,
      rateChange: row.rateChange,
    })),
  };
}

function matchesQuery(summary, q) {
  if (!q) return true;
  const needle = String(q).trim().toLowerCase();
  if (!needle) return true;
  return [summary.productName, summary.sku, summary.productId]
    .filter((value) => value != null && value !== "")
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

async function loadHistoryMaps(db, businessId, history) {
  const productIds = [...new Set(history.map((row) => Number(row.productId)))];
  const supplierIds = [...new Set(history.map((row) => Number(row.supplierId)))];
  const [products, suppliers] = await Promise.all([
    productIds.length
      ? db
          .collection("products")
          .find({ businessId, id: { $in: productIds } })
          .toArray()
      : [],
    supplierIds.length
      ? db
          .collection("suppliers")
          .find({ businessId, id: { $in: supplierIds } })
          .toArray()
      : [],
  ]);
  return {
    productsById: new Map(products.map((row) => [Number(row.id), row])),
    suppliersById: new Map(suppliers.map((row) => [Number(row.id), row])),
  };
}

async function getPurchasePriceReport(db, { businessId, q } = {}) {
  const history = await db
    .collection("supplier_price_history")
    .find({ businessId })
    .sort({ purchasedAt: -1, id: -1 })
    .toArray();

  const { productsById, suppliersById } = await loadHistoryMaps(
    db,
    businessId,
    history
  );

  const byProduct = new Map();
  for (const row of history) {
    const productId = Number(row.productId);
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push(row);
  }

  const products = [...byProduct.entries()]
    .map(([productId, rows]) =>
      summarizeProductPrices({
        productId,
        product: productsById.get(productId),
        history: rows,
        suppliersById,
      })
    )
    .filter((summary) => matchesQuery(summary, q))
    .sort((a, b) => {
      const ta = new Date(a.last?.purchasedAt || 0).getTime();
      const tb = new Date(b.last?.purchasedAt || 0).getTime();
      return tb - ta;
    });

  return { products };
}

async function getPurchasePriceDetail(db, { businessId, productId }) {
  const id = Number(productId);
  const [product, history] = await Promise.all([
    db.collection("products").findOne({ businessId, id }),
    db
      .collection("supplier_price_history")
      .find({ businessId, productId: id })
      .sort({ purchasedAt: -1, id: -1 })
      .toArray(),
  ]);

  if (!product && !history.length) return null;

  const { suppliersById } = await loadHistoryMaps(db, businessId, history);
  return summarizeProductPrices({
    productId: id,
    product,
    history,
    suppliersById,
    includeHistory: true,
  });
}

async function getPurchasePriceHints(
  db,
  { businessId, productId, supplierId }
) {
  const id = Number(productId);
  const product = await db.collection("products").findOne({
    businessId,
    id,
  });
  if (!product) return null;

  const history = await db
    .collection("supplier_price_history")
    .find({ businessId, productId: id })
    .sort({ purchasedAt: -1, id: -1 })
    .toArray();

  const { suppliersById } = await loadHistoryMaps(db, businessId, history);
  return buildPurchasePriceHints({
    product,
    supplierId: supplierId != null ? Number(supplierId) : null,
    history,
    suppliersById,
  });
}

module.exports = {
  toMoney,
  rateChange,
  moneyDiff,
  summarizeProductPrices,
  buildPurchasePriceHints,
  getPurchasePriceReport,
  getPurchasePriceDetail,
  getPurchasePriceHints,
};
