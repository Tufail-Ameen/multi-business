function toOptionalNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function catalogName(item) {
  return String(item?.name || item?.productName || "");
}

function categoryRankMaps(categories) {
  const byId = new Map();
  const byName = new Map();
  for (const [index, category] of (categories || []).entries()) {
    const rank = Number.isFinite(Number(category?.sortOrder))
      ? Number(category.sortOrder)
      : index;
    if (category?.id != null) byId.set(Number(category.id), rank);
    const name = String(category?.name || "").trim().toLowerCase();
    if (name) byName.set(name, rank);
  }
  return { byId, byName };
}

function categoryRankOf(item, byId, byName) {
  const fromId = byId.get(Number(item?.categoryId));
  if (fromId != null) return fromId;
  const fromName = byName.get(String(item?.category || "").trim().toLowerCase());
  if (fromName != null) return fromName;
  const stamped = toOptionalNumber(item?.categorySortOrder);
  if (stamped != null) return stamped;
  return Number.POSITIVE_INFINITY;
}

function compareCatalogItems(a, b, byId = new Map(), byName = new Map()) {
  const aRank = categoryRankOf(a, byId, byName);
  const bRank = categoryRankOf(b, byId, byName);
  if (aRank !== bRank) return aRank - bRank;
  const byItemName = catalogName(a).localeCompare(catalogName(b), undefined, {
    sensitivity: "base",
  });
  if (byItemName) return byItemName;
  return Number(a?.id ?? a?.productId ?? 0) - Number(b?.id ?? b?.productId ?? 0);
}

function sortCatalogItems(items, categories) {
  const { byId, byName } = categoryRankMaps(categories);
  return [...(items || [])].sort((a, b) => compareCatalogItems(a, b, byId, byName));
}

function stampedSortOrder(item, byId, byName) {
  const rank = categoryRankOf(item, byId, byName);
  return rank === Number.POSITIVE_INFINITY ? null : rank;
}

function stampCategorySortOrder(item, byId, byName) {
  return { ...item, categorySortOrder: stampedSortOrder(item, byId, byName) };
}

module.exports = {
  categoryRankMaps,
  categoryRankOf,
  compareCatalogItems,
  sortCatalogItems,
  stampedSortOrder,
  stampCategorySortOrder,
};
