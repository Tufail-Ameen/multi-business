import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page-wrap flex items-center justify-center" style={{ minHeight: "50vh" }}>
        <p className="textcklr mb-0">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function GuestOnly() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="page-wrap flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <p className="textcklr mb-0">Loading…</p>
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/invoices" replace />;
  return <Outlet />;
}

/** Permission-based route guard. Backend par bhi same check zaroori hai. */
export function RequirePermission({ permission, children }) {
  const { isAuthenticated, isLoading, can } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page-wrap flex items-center justify-center" style={{ minHeight: "50vh" }}>
        <p className="textcklr mb-0">Checking access…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permission && !can(permission)) {
    return <Navigate to="/403" replace />;
  }

  return children ?? <Outlet />;
}

/** Chhote UI tukde hide karne ke liye (buttons, links). */
export function Can({ permission, fallback = null, children }) {
  const { can } = useAuth();
  if (!can(permission)) return fallback;
  return children;
}
