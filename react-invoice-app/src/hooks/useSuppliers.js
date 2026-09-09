import { useEffect } from "react";
import { toast } from "react-toastify";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateSupplierMutation,
  useDeleteSupplierMutation,
  useGetSuppliersQuery,
  useUpdateSupplierMutation,
} from "../services/invoiceApi";

/**
 * GET /suppliers — RTK Query hook wrapper.
 * Usage: const { suppliers, isLoading, ... } = useSuppliers()
 */
export function useSuppliers(params = {}) {
  const query = useGetSuppliersQuery(params);

  useEffect(() => {
    if (query.isError) {
      toast.error(getErrorMessage(query.error, "Failed to load suppliers"));
    }
  }, [query.isError, query.error]);

  return {
    suppliers: query.data?.suppliers ?? [],
    pagination: query.data?.pagination,
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** POST /suppliers, PATCH /suppliers/:id, DELETE /suppliers/:id */
export function useSupplierMutations() {
  const [createSupplier, createState] = useCreateSupplierMutation();
  const [updateSupplier, updateState] = useUpdateSupplierMutation();
  const [deleteSupplier, deleteState] = useDeleteSupplierMutation();

  return {
    createSupplier,
    updateSupplier,
    deleteSupplier,
    isSaving: createState.isLoading || updateState.isLoading,
    isDeleting: deleteState.isLoading,
  };
}
