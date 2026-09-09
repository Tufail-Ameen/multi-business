import { createApi } from "@reduxjs/toolkit/query/react";
import { normalizeClient, normalizeClientsResponse } from "../lib/normalizeClient";
import {
  normalizeProduct,
  normalizeProductsResponse,
} from "../lib/normalizeProduct";
import {
  normalizeSupplier,
  normalizeSuppliersResponse,
} from "../lib/normalizeSupplier";
import { axiosBaseQuery } from "../lib/rtkBaseQuery";

/**
 * Poori app ka RTK Query API slice — sab routes Express server (localhost:5001) se.
 */
export const invoiceApi = createApi({
  reducerPath: "invoiceApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    "Client",
    "Product",
    "Category",
    "Movement",
    "Invoice",
    "Supplier",
    "Purchase",
    "SupplierLedger",
    "Auth",
    "User",
    "Role",
    "Business",
    "Audit",
    "RateList",
  ],
  endpoints: (builder) => ({
    // ---- Auth ----
    login: builder.mutation({
      query: (body) => ({ url: "/login", method: "POST", data: body }),
    }),
    register: builder.mutation({
      query: (body) => ({ url: "/register", method: "POST", data: body }),
    }),
    logout: builder.mutation({
      query: (refreshToken) => ({
        url: "/auth/logout",
        method: "POST",
        data: { refreshToken },
      }),
    }),
    me: builder.query({
      query: () => ({ url: "/auth/me" }),
      providesTags: ["Auth"],
    }),
    switchBusiness: builder.mutation({
      query: (body) => ({
        url: "/auth/switch-business",
        method: "POST",
        data: body,
      }),
      invalidatesTags: [
        "Auth",
        "Client",
        "Product",
        "Category",
        "Invoice",
        "Movement",
        "Supplier",
        "Purchase",
        "SupplierLedger",
        "User",
        "Role",
        "Audit",
        "Business",
        "RateList",
      ],
    }),

    // ---- Team: users ----
    getUsers: builder.query({
      query: (params = {}) => ({ url: "/users", params }),
      providesTags: (result) =>
        result?.users || result?.items
          ? [
              ...(result.users || result.items).map(({ id }) => ({ type: "User", id })),
              { type: "User", id: "LIST" },
            ]
          : [{ type: "User", id: "LIST" }],
    }),
    inviteUser: builder.mutation({
      query: (body) => ({ url: "/users", method: "POST", data: body }),
      invalidatesTags: [{ type: "User", id: "LIST" }],
    }),
    updateUser: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/users/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "User", id },
        { type: "User", id: "LIST" },
      ],
    }),
    removeUser: builder.mutation({
      query: (id) => ({ url: `/users/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "User", id: "LIST" }],
    }),

    // ---- Team: roles ----
    getRoles: builder.query({
      query: () => ({ url: "/roles" }),
      providesTags: [{ type: "Role", id: "LIST" }],
    }),
    createRole: builder.mutation({
      query: (body) => ({ url: "/roles", method: "POST", data: body }),
      invalidatesTags: [{ type: "Role", id: "LIST" }],
    }),
    updateRole: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/roles/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: [{ type: "Role", id: "LIST" }, "Auth"],
    }),
    deleteRole: builder.mutation({
      query: (id) => ({ url: `/roles/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Role", id: "LIST" }],
    }),

    // ---- Platform businesses ----
    getPlatformBusinesses: builder.query({
      query: () => ({ url: "/platform/businesses" }),
      providesTags: [{ type: "Business", id: "LIST" }],
    }),
    createPlatformBusiness: builder.mutation({
      query: (body) => ({
        url: "/platform/businesses",
        method: "POST",
        data: body,
      }),
      invalidatesTags: [{ type: "Business", id: "LIST" }],
    }),
    updatePlatformBusiness: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/platform/businesses/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: [{ type: "Business", id: "LIST" }],
    }),

    // ---- Audit ----
    getAuditLogs: builder.query({
      query: (params = {}) => ({ url: "/audit-logs", params }),
      providesTags: [{ type: "Audit", id: "LIST" }],
    }),

    // ---- Clients (real API: GET returns array, PUT/DELETE use numeric id) ----
    getClients: builder.query({
      query: () => ({ url: "/clients" }),
      transformResponse: normalizeClientsResponse,
      providesTags: (result) =>
        result?.clients
          ? [
              ...result.clients.map((c) => ({ type: "Client", id: c.key || c.id })),
              { type: "Client", id: "LIST" },
            ]
          : [{ type: "Client", id: "LIST" }],
    }),
    getClient: builder.query({
      query: (id) => ({ url: `/clients/${id}` }),
      transformResponse: (response) => ({
        client: normalizeClient(response?.client ?? response),
      }),
      providesTags: (result, error, id) => [{ type: "Client", id }],
    }),
    createClient: builder.mutation({
      query: (body) => ({ url: "/clients", method: "POST", data: body }),
      transformResponse: (response) => ({
        client: normalizeClient(response?.client ?? response),
      }),
      invalidatesTags: [{ type: "Client", id: "LIST" }],
    }),
    updateClient: builder.mutation({
      query: ({ id, _id, key, ...body }) => ({
        url: `/clients/${id}`,
        method: "PUT",
        data: body,
      }),
      invalidatesTags: [{ type: "Client", id: "LIST" }],
    }),
    deleteClient: builder.mutation({
      query: (id) => ({ url: `/clients/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Client", id: "LIST" }],
    }),

    // ---- Products (GET /products → raw array from Express) ----
    getProducts: builder.query({
      query: (params = {}) => ({ url: "/products", params }),
      transformResponse: normalizeProductsResponse,
      providesTags: (result) =>
        result?.products
          ? [
              ...result.products.map(({ id }) => ({ type: "Product", id })),
              { type: "Product", id: "LIST" },
            ]
          : [{ type: "Product", id: "LIST" }],
    }),
    getProduct: builder.query({
      query: (id) => ({ url: `/products/${id}` }),
      transformResponse: (response) => normalizeProduct(response),
      providesTags: (result, error, id) => [{ type: "Product", id }],
    }),
    createProduct: builder.mutation({
      query: (body) => ({ url: "/products", method: "POST", data: body }),
      invalidatesTags: [
        { type: "Product", id: "LIST" },
        { type: "Movement", id: "LIST" },
      ],
    }),
    updateProduct: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/products/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Product", id },
        { type: "Product", id: "LIST" },
      ],
    }),
    deleteProduct: builder.mutation({
      query: (id) => ({ url: `/products/${id}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "Product", id: "LIST" },
        { type: "Movement", id: "LIST" },
      ],
    }),

    // ---- Categories ----
    getCategories: builder.query({
      query: (params = {}) => ({ url: "/categories", params }),
      providesTags: (result) =>
        result?.categories
          ? [
              ...result.categories.map(({ id }) => ({ type: "Category", id })),
              { type: "Category", id: "LIST" },
            ]
          : [{ type: "Category", id: "LIST" }],
    }),
    createCategory: builder.mutation({
      query: (body) => ({ url: "/categories", method: "POST", data: body }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),
    updateCategory: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/categories/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),
    deleteCategory: builder.mutation({
      query: (id) => ({ url: `/categories/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),

    // ---- Inventory ----
    getMovements: builder.query({
      query: (params = {}) => ({ url: "/inventory/movements", params }),
      providesTags: [{ type: "Movement", id: "LIST" }],
    }),
    getLowStock: builder.query({
      query: () => ({ url: "/inventory/low-stock" }),
      transformResponse: (response) => ({
        products: (response?.products || []).map(normalizeProduct),
      }),
      providesTags: [{ type: "Product", id: "LOW_STOCK" }],
    }),
    adjustInventory: builder.mutation({
      query: (body) => ({ url: "/inventory/adjust", method: "POST", data: body }),
      invalidatesTags: [
        { type: "Product", id: "LIST" },
        { type: "Product", id: "LOW_STOCK" },
        { type: "Movement", id: "LIST" },
      ],
    }),
    openingStock: builder.mutation({
      query: (body) => ({
        url: "/inventory/opening-stock",
        method: "POST",
        data: body,
      }),
      invalidatesTags: [
        { type: "Product", id: "LIST" },
        { type: "Product", id: "LOW_STOCK" },
        { type: "Movement", id: "LIST" },
      ],
    }),

    // ---- Invoices ----
    getInvoices: builder.query({
      query: (params = {}) => ({ url: "/invoices", params }),
      providesTags: (result) =>
        result?.invoices
          ? [
              ...result.invoices.map(({ id }) => ({ type: "Invoice", id })),
              { type: "Invoice", id: "LIST" },
            ]
          : [{ type: "Invoice", id: "LIST" }],
    }),
    getInvoice: builder.query({
      query: (id) => ({ url: `/invoices/${id}` }),
      providesTags: (result, error, id) => [{ type: "Invoice", id }],
    }),
    createInvoice: builder.mutation({
      query: (body) => ({ url: "/invoices", method: "POST", data: body }),
      invalidatesTags: [
        { type: "Invoice", id: "LIST" },
        { type: "Product", id: "LIST" },
        { type: "Movement", id: "LIST" },
      ],
    }),
    updateInvoice: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/invoices/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Invoice", id },
        { type: "Invoice", id: "LIST" },
      ],
    }),
    updateInvoiceStatus: builder.mutation({
      query: ({ id, status }) => ({
        url: `/invoices/${id}/status`,
        method: "PATCH",
        data: { status },
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Invoice", id },
        { type: "Invoice", id: "LIST" },
        { type: "Product", id: "LIST" },
        { type: "Movement", id: "LIST" },
      ],
    }),
    deleteInvoice: builder.mutation({
      query: (id) => ({ url: `/invoices/${id}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "Invoice", id: "LIST" },
        { type: "Product", id: "LIST" },
        { type: "Movement", id: "LIST" },
      ],
    }),

    // ---- Suppliers ----
    getSuppliers: builder.query({
      query: (params = {}) => ({ url: "/suppliers", params }),
      transformResponse: normalizeSuppliersResponse,
      providesTags: (result) =>
        result?.suppliers
          ? [
              ...result.suppliers.map((s) => ({
                type: "Supplier",
                id: s.key || s.id,
              })),
              { type: "Supplier", id: "LIST" },
            ]
          : [{ type: "Supplier", id: "LIST" }],
    }),
    getSupplier: builder.query({
      query: (id) => ({ url: `/suppliers/${id}` }),
      transformResponse: (response) => ({
        supplier: normalizeSupplier(response?.supplier ?? response),
      }),
      providesTags: (result, error, id) => [{ type: "Supplier", id }],
    }),
    createSupplier: builder.mutation({
      query: (body) => ({ url: "/suppliers", method: "POST", data: body }),
      transformResponse: (response) => ({
        supplier: normalizeSupplier(response?.supplier ?? response),
      }),
      invalidatesTags: [{ type: "Supplier", id: "LIST" }],
    }),
    updateSupplier: builder.mutation({
      query: ({ id, _id, key, ...body }) => ({
        url: `/suppliers/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Supplier", id },
        { type: "Supplier", id: "LIST" },
      ],
    }),
    deleteSupplier: builder.mutation({
      query: (id) => ({ url: `/suppliers/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Supplier", id: "LIST" }],
    }),
    getSupplierLedger: builder.query({
      query: (id) => ({ url: `/suppliers/${id}/ledger` }),
      transformResponse: (response) => ({
        supplier: normalizeSupplier(response?.supplier),
        entries: response?.entries || [],
        summary: response?.summary,
      }),
      providesTags: (result, error, id) => [
        { type: "SupplierLedger", id },
        { type: "Supplier", id },
      ],
    }),
    getSupplierPayments: builder.query({
      query: (id) => ({ url: `/suppliers/${id}/payments` }),
      providesTags: (result, error, id) => [
        { type: "SupplierLedger", id: `PAYMENTS-${id}` },
      ],
    }),
    createSupplierPayment: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/suppliers/${id}/payments`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Supplier", id },
        { type: "Supplier", id: "LIST" },
        { type: "SupplierLedger", id },
        { type: "SupplierLedger", id: `PAYMENTS-${id}` },
        { type: "Purchase", id: "LIST" },
      ],
    }),

    // ---- Purchases ----
    getPurchases: builder.query({
      query: (params = {}) => ({ url: "/purchases", params }),
      transformResponse: (response) => ({
        purchases: response?.purchases || (Array.isArray(response) ? response : []),
        pagination: response?.pagination,
      }),
      providesTags: (result) =>
        result?.purchases
          ? [
              ...result.purchases.map(({ id }) => ({ type: "Purchase", id })),
              { type: "Purchase", id: "LIST" },
            ]
          : [{ type: "Purchase", id: "LIST" }],
    }),
    getPurchase: builder.query({
      query: (id) => ({ url: `/purchases/${id}` }),
      transformResponse: (response) => ({
        purchase: response?.purchase ?? response,
      }),
      providesTags: (result, error, id) => [{ type: "Purchase", id }],
    }),
    createPurchase: builder.mutation({
      query: (body) => ({ url: "/purchases", method: "POST", data: body }),
      transformResponse: (response) => ({
        purchase: response?.purchase ?? response,
      }),
      invalidatesTags: [{ type: "Purchase", id: "LIST" }],
    }),
    updatePurchase: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/purchases/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Purchase", id },
        { type: "Purchase", id: "LIST" },
      ],
    }),
    confirmPurchase: builder.mutation({
      query: (id) => ({ url: `/purchases/${id}/confirm`, method: "POST" }),
      invalidatesTags: (result, error, id) => [
        { type: "Purchase", id },
        { type: "Purchase", id: "LIST" },
        { type: "Product", id: "LIST" },
        { type: "Movement", id: "LIST" },
        "Supplier",
        "SupplierLedger",
      ],
    }),
    cancelPurchase: builder.mutation({
      query: (id) => ({ url: `/purchases/${id}/cancel`, method: "POST" }),
      invalidatesTags: (result, error, id) => [
        { type: "Purchase", id },
        { type: "Purchase", id: "LIST" },
      ],
    }),
    deletePurchase: builder.mutation({
      query: (id) => ({ url: `/purchases/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Purchase", id: "LIST" }],
    }),

    // ---- Rate lists ----
    getRateLists: builder.query({
      query: (params = {}) => ({ url: "/rate-lists", params }),
      transformResponse: (response) => ({
        rateLists: response?.rateLists || (Array.isArray(response) ? response : []),
        pagination: response?.pagination,
      }),
      providesTags: (result) =>
        result?.rateLists
          ? [
              ...result.rateLists.map(({ id }) => ({ type: "RateList", id })),
              { type: "RateList", id: "LIST" },
            ]
          : [{ type: "RateList", id: "LIST" }],
    }),
    getRateList: builder.query({
      query: (id) => ({ url: `/rate-lists/${id}` }),
      transformResponse: (response) => response?.rateList ?? response,
      providesTags: (result, error, id) => [{ type: "RateList", id }],
    }),
    getClientRateLists: builder.query({
      query: (id) => ({ url: `/clients/${id}/rate-lists` }),
      transformResponse: (response) => ({
        rateLists: response?.rateLists || (Array.isArray(response) ? response : []),
        pagination: response?.pagination,
      }),
      providesTags: (result, error, id) => [
        { type: "RateList", id: `CLIENT-${id}` },
        { type: "RateList", id: "LIST" },
      ],
    }),
    createRateList: builder.mutation({
      query: (body) => ({ url: "/rate-lists", method: "POST", data: body }),
      transformResponse: (response) => response?.rateList ?? response,
      invalidatesTags: [
        { type: "RateList", id: "LIST" },
        { type: "Client", id: "LIST" },
      ],
    }),
    updateRateList: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/rate-lists/${id}`,
        method: "PATCH",
        data: body,
      }),
      transformResponse: (response) => response?.rateList ?? response,
      invalidatesTags: (result, error, { id }) => [
        { type: "RateList", id },
        { type: "RateList", id: "LIST" },
        { type: "Client", id: "LIST" },
      ],
    }),
    deleteRateList: builder.mutation({
      query: (id) => ({ url: `/rate-lists/${id}`, method: "DELETE" }),
      invalidatesTags: (result, error, id) => [
        { type: "RateList", id },
        { type: "RateList", id: "LIST" },
        { type: "Client", id: "LIST" },
      ],
    }),
    sendRateList: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/rate-lists/${id}/send`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "RateList", id },
        { type: "RateList", id: "LIST" },
        { type: "Client", id: "LIST" },
      ],
    }),
    duplicateRateList: builder.mutation({
      query: (id) => ({ url: `/rate-lists/${id}/duplicate`, method: "POST" }),
      transformResponse: (response) => response?.rateList ?? response,
      invalidatesTags: [
        { type: "RateList", id: "LIST" },
        { type: "Client", id: "LIST" },
      ],
    }),
    getPublicRateList: builder.query({
      query: (token) => ({
        url: `/public/rate-lists/${token}`,
        skipAuth: true,
      }),
      transformResponse: (response) => response?.rateList ?? response,
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useMeQuery,
  useLazyMeQuery,
  useSwitchBusinessMutation,
  useGetUsersQuery,
  useInviteUserMutation,
  useUpdateUserMutation,
  useRemoveUserMutation,
  useGetRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetPlatformBusinessesQuery,
  useCreatePlatformBusinessMutation,
  useUpdatePlatformBusinessMutation,
  useGetAuditLogsQuery,
  useGetClientsQuery,
  useGetClientQuery,
  useCreateClientMutation,
  useUpdateClientMutation,
  useDeleteClientMutation,
  useGetProductsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetMovementsQuery,
  useGetLowStockQuery,
  useAdjustInventoryMutation,
  useOpeningStockMutation,
  useGetInvoicesQuery,
  useGetInvoiceQuery,
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  useUpdateInvoiceStatusMutation,
  useDeleteInvoiceMutation,
  useGetSuppliersQuery,
  useGetSupplierQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useGetSupplierLedgerQuery,
  useGetSupplierPaymentsQuery,
  useCreateSupplierPaymentMutation,
  useGetPurchasesQuery,
  useGetPurchaseQuery,
  useCreatePurchaseMutation,
  useUpdatePurchaseMutation,
  useConfirmPurchaseMutation,
  useCancelPurchaseMutation,
  useDeletePurchaseMutation,
  useGetRateListsQuery,
  useGetRateListQuery,
  useGetClientRateListsQuery,
  useCreateRateListMutation,
  useUpdateRateListMutation,
  useDeleteRateListMutation,
  useSendRateListMutation,
  useDuplicateRateListMutation,
  useGetPublicRateListQuery,
} = invoiceApi;
