import { useEffect } from "react";
import { toast } from "react-toastify";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { useGetProductsQuery } from "../services/invoiceApi";

/**
 * GET /products — RTK Query with optional search/filter params.
 * Usage: const { products, isLoading } = useProducts({ q, lowStock: true })
 */
export function useProducts(params = {}) {
  const query = useGetProductsQuery(params);

  useEffect(() => {
    if (query.isError) {
      toast.error(getErrorMessage(query.error, "Failed to load products"));
    }
  }, [query.isError, query.error]);

  return {
    products: query.data?.products ?? [],
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
