import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { onSessionExpired } from "../lib/apiClient";
import {
  hasEveryUserPermission,
  hasUserPermission,
  isPlatformAdminUser,
} from "../lib/permissions";
import { getErrorMessage } from "../lib/rtkBaseQuery";
import { tokenStore } from "../lib/tokenStore";
import {
  invoiceApi,
  useLazyMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useRegisterMutation,
  useSwitchBusinessMutation,
} from "../services/invoiceApi";

const AuthContext = createContext(null);
const BOOTSTRAP_TIMEOUT_MS = 4000;

function applySessionUser(user) {
  if (user?.activeBusinessId) tokenStore.setBusinessId(user.activeBusinessId);
  return user;
}

function requireUser(data, source) {
  const user = data?.user;

  if (!user || typeof user !== "object") {
    throw new Error(`${source} response mein user missing hai.`);
  }
  if (!Array.isArray(user.permissions)) {
    throw new Error(`${source} response mein user.permissions missing hain.`);
  }
  if (!isPlatformAdminUser(user) && !user.activeBusinessId) {
    throw new Error(`${source} response mein activeBusinessId missing hai.`);
  }

  return user;
}

function requireSession(data, source) {
  const user = requireUser(data, source);
  if (!data?.tokens?.accessToken || !data?.tokens?.refreshToken) {
    throw new Error(
      `${source} response mein accessToken ya refreshToken missing hai.`
    );
  }
  return { user, tokens: data.tokens };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("BOOTSTRAP_TIMEOUT")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function AuthProvider({ children }) {
  const dispatch = useDispatch();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loginMutation] = useLoginMutation();
  const [registerMutation] = useRegisterMutation();
  const [logoutMutation] = useLogoutMutation();
  const [switchBusinessMutation] = useSwitchBusinessMutation();
  const [fetchMe] = useLazyMeQuery();

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus("unauthenticated");
    dispatch(invoiceApi.util.resetApiState());
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // Bina token → seedha login.
      if (!tokenStore.access && !tokenStore.refresh) {
        if (!cancelled) setStatus("unauthenticated");
        return;
      }

      try {
        // Backend down / hang ho to Loading forever na rahe.
        const data = await withTimeout(fetchMe().unwrap(), BOOTSTRAP_TIMEOUT_MS);
        if (cancelled) return;
        setUser(applySessionUser(requireUser(data, "Session")));
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        tokenStore.clear();
        setUser(null);
        setStatus("unauthenticated");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  useEffect(
    () =>
      onSessionExpired(() => {
        clearSession();
        toast.error("Session khatam. Dobara login karein.");
      }),
    [clearSession]
  );

  const login = useCallback(
    async (email, password) => {
      const data = await loginMutation({ email, password }).unwrap();
      const session = requireSession(data, "Login");
      tokenStore.set({
        ...session.tokens,
        businessId: session.user.activeBusinessId || null,
      });
      setUser(applySessionUser(session.user));
      setStatus("authenticated");
      return session.user;
    },
    [loginMutation]
  );

  const register = useCallback(
    async (body) => {
      const data = await registerMutation(body).unwrap();
      const session = requireSession(data, "Register");
      tokenStore.set({
        ...session.tokens,
        businessId: session.user.activeBusinessId || null,
      });
      setUser(applySessionUser(session.user));
      setStatus("authenticated");
      return session.user;
    },
    [registerMutation]
  );

  const switchBusiness = useCallback(
    async (businessId) => {
      const data = await switchBusinessMutation({ businessId }).unwrap();
      const session = requireSession(data, "Business switch");
      tokenStore.set({
        ...session.tokens,
        businessId: session.user.activeBusinessId || businessId,
      });
      setUser(applySessionUser(session.user));
      dispatch(invoiceApi.util.resetApiState());
      return session.user;
    },
    [switchBusinessMutation, dispatch]
  );

  const logout = useCallback(async () => {
    try {
      if (tokenStore.refresh) {
        await logoutMutation(tokenStore.refresh).unwrap();
      }
    } catch {
      // local cleanup still needed
    }
    clearSession();
  }, [logoutMutation, clearSession]);

  const value = useMemo(() => {
    const permissions = user?.permissions ?? [];
    const activeBusiness =
      user?.businesses?.find((b) => b.id === user?.activeBusinessId) ||
      user?.businesses?.[0] ||
      null;
    const isPlatformAdmin = isPlatformAdminUser(user);

    return {
      user,
      status,
      isAuthenticated: status === "authenticated",
      isLoading: status === "loading",
      permissions,
      activeBusiness,
      businesses: user?.businesses ?? [],
      isPlatformAdmin,
      can: (permission) => hasUserPermission(user, permission),
      canAll: (list) => hasEveryUserPermission(user, list),
      login,
      register,
      logout,
      switchBusiness,
      getErrorMessage,
    };
  }, [user, status, login, register, logout, switchBusiness]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
