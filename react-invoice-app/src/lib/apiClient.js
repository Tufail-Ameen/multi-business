import axios from "axios";
import { tokenStore } from "./tokenStore";

// Dev: empty → CRA proxy (package.json) forwards to 127.0.0.1:5001 (no CORS).
// Prod: set REACT_APP_API_BASE_URL to your API origin.
export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? "";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

const sessionExpiredListeners = new Set();
export function onSessionExpired(listener) {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

api.interceptors.request.use((config) => {
  if (config.skipAuth) {
    delete config.headers.Authorization;
    delete config.headers["X-Business-Id"];
    return config;
  }
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const businessId = tokenStore.businessId;
  if (businessId) config.headers["X-Business-Id"] = businessId;
  return config;
});

let refreshPromise = null;

async function refreshTokens() {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) throw new Error("No refresh token");

  refreshPromise =
    refreshPromise ??
    axios
      .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      .then((response) => {
        const tokens = response.data.data.tokens;
        tokenStore.set(tokens);
        return tokens;
      })
      .finally(() => {
        refreshPromise = null;
      });

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (!response) {
      const timedOut =
        error.code === "ECONNABORTED" ||
        String(error.message || "").toLowerCase().includes("timeout");
      throw new ApiError({
        status: 0,
        code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        message: timedOut
          ? "Server respond nahi kar raha. Dobara Save dabain."
          : "Server se rabta nahi ho saka. Internet ya backend check karein.",
      });
    }

    const isAuthEndpoint =
      config?.url === "/login" ||
      config?.url === "/register" ||
      config?.url?.includes("/auth/refresh");

    if (response.status === 401 && !config._retried && !isAuthEndpoint && !config.skipAuth) {
      config._retried = true;
      try {
        await refreshTokens();
        return api(config);
      } catch {
        tokenStore.clear();
        sessionExpiredListeners.forEach((listener) => listener());
      }
    }

    const payload = response.data?.error ?? {};
    const message =
      payload.message ||
      (typeof response.data === "string" ? response.data : null) ||
      response.data?.message ||
      "Kuch ghalat ho gaya.";
    throw new ApiError({
      status: response.status,
      code: payload.code ?? "UNKNOWN_ERROR",
      message,
      details: payload.details,
    });
  }
);

export async function request(config) {
  const response = await api.request(config);
  return response.data?.data ?? response.data;
}

export const get = (url, params) => request({ method: "GET", url, params });
export const post = (url, data) => request({ method: "POST", url, data });
export const patch = (url, data) => request({ method: "PATCH", url, data });
export const put = (url, data) => request({ method: "PUT", url, data });
export const del = (url) => request({ method: "DELETE", url });
