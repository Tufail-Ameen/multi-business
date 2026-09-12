import { useEffect } from "react";
import { toast } from "react-toastify";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import {
  useCreateClientMutation,
  useDeleteClientMutation,
  useGetClientsQuery,
  useUpdateClientMutation,
} from "../services/invoiceApi";

/**
 * GET /clients — RTK Query hook wrapper.
 * Usage: const { clients, isLoading, ... } = useClients({ q, per_page: 100 })
 */
export function useClients(params = {}) {
  const query = useGetClientsQuery({ per_page: 100, ...params });

  useEffect(() => {
    if (query.isError) {
      toast.error(getErrorMessage(query.error, "Failed to load clients"));
    }
  }, [query.isError, query.error]);

  return {
    clients: query.data?.clients ?? [],
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** POST /clients, PATCH /clients/:id, DELETE /clients/:id */
export function useClientMutations() {
  const [createClient, createState] = useCreateClientMutation();
  const [updateClient, updateState] = useUpdateClientMutation();
  const [deleteClient, deleteState] = useDeleteClientMutation();

  return {
    createClient,
    updateClient,
    deleteClient,
    isSaving: createState.isLoading || updateState.isLoading,
    isDeleting: deleteState.isLoading,
  };
}
