/**
 * Route checklist (docs / Postman).
 * UI ab RTK Query se call karti hai — dekho `src/services/invoiceApi.js`.
 * Full contract: docs/RBAC_API_CONTRACT.md
 */
import { del, get, patch, post, put } from "../lib/apiClient";

export const authApi = {
  login: (body) => post("/login", body),
  register: (body) => post("/register", body),
  logout: (refreshToken) => post("/auth/logout", { refreshToken }),
  me: () => get("/auth/me"),
  refresh: (refreshToken) => post("/auth/refresh", { refreshToken }),
  switchBusiness: (body) => post("/auth/switch-business", body),
};

export const clientsApi = {
  list: () => get("/clients"),
  detail: (id) => get(`/clients/${id}`),
  create: (body) => post("/clients", body),
  update: ({ id, ...body }) => put(`/clients/${id}`, body),
  remove: (id) => del(`/clients/${id}`),
};

export const productsApi = {
  list: (params) => get("/products", params),
  detail: (id) => get(`/products/${id}`),
  create: (body) => post("/products", body),
  update: ({ id, ...body }) => patch(`/products/${id}`, body),
  remove: (id) => del(`/products/${id}`),
};

export const inventoryApi = {
  adjust: (body) => post("/inventory/adjust", body),
  movements: (params) => get("/inventory/movements", params),
};

export const invoicesApi = {
  list: (params) => get("/invoices", params),
  detail: (id) => get(`/invoices/${id}`),
  create: (body) => post("/invoices", body),
  update: ({ id, ...body }) => patch(`/invoices/${id}`, body),
  updateStatus: ({ id, status }) => patch(`/invoices/${id}/status`, { status }),
  remove: (id) => del(`/invoices/${id}`),
};

export const usersApi = {
  list: (params) => get("/users", params),
  invite: (body) => post("/users", body),
  update: ({ id, ...body }) => patch(`/users/${id}`, body),
  remove: (id) => del(`/users/${id}`),
};

export const rolesApi = {
  list: () => get("/roles"),
  create: (body) => post("/roles", body),
  update: ({ id, ...body }) => patch(`/roles/${id}`, body),
  remove: (id) => del(`/roles/${id}`),
};

export const platformApi = {
  listBusinesses: () => get("/platform/businesses"),
  createBusiness: (body) => post("/platform/businesses", body),
  updateBusiness: ({ id, ...body }) => patch(`/platform/businesses/${id}`, body),
};

export const auditApi = {
  list: (params) => get("/audit-logs", params),
};

export const rateListsApi = {
  list: (params) => get("/rate-lists", params),
  detail: (id) => get(`/rate-lists/${id}`),
  clientLists: (id) => get(`/clients/${id}/rate-lists`),
  create: (body) => post("/rate-lists", body),
  update: ({ id, ...body }) => patch(`/rate-lists/${id}`, body),
  remove: (id) => del(`/rate-lists/${id}`),
  send: ({ id, ...body }) => post(`/rate-lists/${id}/send`, body),
  duplicate: (id) => post(`/rate-lists/${id}/duplicate`),
};
