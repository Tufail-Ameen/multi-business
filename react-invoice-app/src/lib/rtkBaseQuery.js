import { api, ApiError } from "./apiClient";

/**
 * Axios-based RTK Query baseQuery.
 * JWT refresh interceptor `api` pe pehle se hai — yahan reuse.
 */
export const axiosBaseQuery =
  () =>
  async ({ url, method = "GET", data, params, headers, skipAuth }) => {
    try {
      const result = await api({ url, method, data, params, headers, skipAuth });
      return { data: result.data?.data ?? result.data };
    } catch (err) {
      if (err instanceof ApiError) {
        return {
          error: {
            status: err.status,
            data: {
              message: err.message,
              code: err.code,
              details: err.details,
            },
          },
        };
      }
      return {
        error: {
          status: 0,
          data: { message: "Server se rabta nahi ho saka.", code: "NETWORK_ERROR" },
        },
      };
    }
  };

export function getErrorMessage(error, fallback = "Kuch ghalat ho gaya.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error?.data?.message || error?.message || fallback;
}

export function getErrorCode(error) {
  return error?.data?.code || error?.code || null;
}
