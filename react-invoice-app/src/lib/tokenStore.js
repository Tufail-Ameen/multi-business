const ACCESS_KEY = "invoice.accessToken";
const REFRESH_KEY = "invoice.refreshToken";
const BUSINESS_KEY = "invoice.activeBusinessId";

/**
 * Demo tokens localStorage mein hain.
 * Real backend mein refresh token httpOnly cookie mein rakho.
 */
export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  get businessId() {
    return localStorage.getItem(BUSINESS_KEY);
  },
  set({ accessToken, refreshToken, businessId } = {}) {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    if (businessId !== undefined) {
      if (businessId) localStorage.setItem(BUSINESS_KEY, businessId);
      else localStorage.removeItem(BUSINESS_KEY);
    }
  },
  setBusinessId(businessId) {
    if (businessId) localStorage.setItem(BUSINESS_KEY, businessId);
    else localStorage.removeItem(BUSINESS_KEY);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(BUSINESS_KEY);
  },
};
