import { faFileInvoice } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import BusinessSwitcher from "./BusinessSwitcher";
import { getNavPageTitle } from "./navLinks";

export default function MobileHeader() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const pageTitle = getNavPageTitle(pathname);

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "??";

  return (
    <header className="mobile-header">
      <Link to="/invoices" className="mobile-brand">
        <span className="mobile-logo">
          <FontAwesomeIcon icon={faFileInvoice} />
        </span>
        <span className="mobile-brand-copy">
          <span className="mobile-brand-name">Invoice App</span>
          {pageTitle ? <span className="mobile-brand-page">{pageTitle}</span> : null}
        </span>
      </Link>
      <div className="mobile-header-end">
        <BusinessSwitcher />
        <span className="mobile-avatar" aria-hidden="true">
          {initials}
        </span>
      </div>
    </header>
  );
}
