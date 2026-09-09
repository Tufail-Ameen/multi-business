/** Normalize real Express /clients records (`_id` + numeric `id`). */
export function normalizeClient(client) {
  if (!client) return client;
  return {
    ...client,
    // UI + React keys: prefer Mongo _id when present
    key: client._id || String(client.id),
    // Mutations (PUT/DELETE) is backend pe numeric `id` use karti hain
    id: client.id,
    _id: client._id,
  };
}

export function normalizeClientsResponse(response) {
  const list = Array.isArray(response)
    ? response
    : response?.clients ?? response?.data ?? [];
  return {
    clients: list.map(normalizeClient),
    meta: response?.meta,
  };
}
