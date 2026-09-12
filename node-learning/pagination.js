function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseListPagination(query, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(
    maxLimit,
    Math.max(1, Number(query.per_page || query.limit) || defaultLimit)
  );
  return { page, perPage, skip: (page - 1) * perPage };
}

function paginationMeta(page, perPage, total) {
  return {
    page,
    per_page: perPage,
    limit: perPage,
    total,
    pages: Math.ceil(total / perPage) || 1,
  };
}

async function paginateFind(
  collection,
  filter,
  { page, perPage, skip, sort }
) {
  const [total, rows] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).sort(sort).skip(skip).limit(perPage).toArray(),
  ]);
  return { total, rows, pagination: paginationMeta(page, perPage, total) };
}

function paginateArray(items, { page, perPage, skip }) {
  const total = items.length;
  return {
    rows: items.slice(skip, skip + perPage),
    pagination: paginationMeta(page, perPage, total),
  };
}

module.exports = {
  escapeRegex,
  parseListPagination,
  paginationMeta,
  paginateFind,
  paginateArray,
};
