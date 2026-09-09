/** Normalize Express /products records for the generic catalog UI. */

function calcNetRate(tpRate, discountPercent) {
  const tp = Number(tpRate);
  const pct = Number(discountPercent);
  if (!Number.isFinite(tp) || tp < 0) return null;
  if (!Number.isFinite(pct) || pct < 0) return tp;
  return Math.round(tp * (1 - pct / 100) * 100) / 100;
}

export function normalizeProduct(product) {
  if (!product) return product;

  const printRate =
    product.printRate ??
    product.print_rate ??
    product.printedPrice ??
    product.wholesalePrice ??
    product.wholesale_price ??
    null;
  const salePrice =
    product.salePrice ??
    product.sale_price ??
    product.price ??
    null;
  const purchasePrice =
    product.purchasePrice ?? product.purchase_price ?? product.tpRate ?? null;
  const currentStock =
    product.currentStock ?? product.stock ?? 0;
  const minimumStockLevel =
    product.minimumStockLevel ?? product.minStock ?? 0;
  const tpRate = product.tpRate ?? purchasePrice;
  const discountPercent = product.discountPercent ?? null;
  const netRate =
    product.netRate ??
    (tpRate != null && discountPercent != null
      ? calcNetRate(tpRate, discountPercent)
      : null);
  const stockStatus =
    product.stockStatus ||
    (Number(currentStock) < Number(minimumStockLevel) ? "LOW_STOCK" : "OK");

  return {
    ...product,
    key: product._id || String(product.id),
    id: product.id,
    _id: product._id,
    name: product.name ?? "",
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    brand: product.brand ?? "",
    unit: product.unit || "pcs",
    categoryId: product.categoryId ?? null,
    category: product.category ?? "",
    description: product.description ?? "",
    purchasePrice,
    salePrice,
    printRate,
    wholesalePrice: product.wholesalePrice ?? product.wholesale_price ?? printRate,
    currentStock: Number(currentStock) || 0,
    stock: Number(currentStock) || 0,
    minimumStockLevel: Number(minimumStockLevel) || 0,
    minStock: Number(minimumStockLevel) || 0,
    stockStatus,
    status: product.status || "active",
    trackVariants: product.trackVariants === true,
    variants: Array.isArray(product.variants) ? product.variants : undefined,
    // Legacy aliases for older invoice helpers
    tpRate,
    discountPercent,
    netRate,
    price: salePrice,
  };
}

export function normalizeProductsResponse(response) {
  const list = Array.isArray(response)
    ? response
    : response?.products ?? response?.data ?? [];
  return {
    products: list.map(normalizeProduct),
    meta: response?.meta,
  };
}
