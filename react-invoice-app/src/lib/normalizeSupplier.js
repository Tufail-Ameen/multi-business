/** Normalize Express /suppliers records (`id` + optional Mongo `_id`). */
export function normalizeSupplier(supplier) {
  if (!supplier) return supplier;
  return {
    ...supplier,
    key: supplier._id || String(supplier.id),
    id: supplier.id,
    _id: supplier._id,
  };
}

export function normalizeSuppliersResponse(response) {
  const list = Array.isArray(response)
    ? response
    : response?.suppliers ?? response?.data ?? [];
  return {
    suppliers: list.map(normalizeSupplier),
    pagination: response?.pagination,
    meta: response?.meta,
  };
}
