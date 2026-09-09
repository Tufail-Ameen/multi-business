import { useEffect, useRef, useState } from "react";
import { faChevronDown, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import BusinessSwitcher from "./BusinessSwitcher";
import { getNavPageTitle, getNavSectionLabel } from "./navLinks";

export default function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const pageTitle = getNavPageTitle(pathname);
  const sectionLabel = getNavSectionLabel(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "??";

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="app-navbar">
      <div className="navbar-start">
        <p className="navbar-eyebrow">{sectionLabel}</p>
        <h1 className="navbar-title">{pageTitle}</h1>
      </div>

      <div className="navbar-end">
        <BusinessSwitcher />

        <div className="navbar-user-menu" ref={menuRef}>
          <button
            type="button"
            className={`navbar-user${menuOpen ? " is-open" : ""}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="navbar-avatar">{initials}</span>
            <span className="navbar-user-meta">
              <span className="navbar-user-name">{user?.fullName || "User"}</span>
              <span className="navbar-user-role">{user?.role?.name || "Member"}</span>
            </span>
            <FontAwesomeIcon icon={faChevronDown} className="navbar-user-caret" />
          </button>

          {menuOpen && (
            <div className="navbar-user-dropdown" role="menu">
              <div className="navbar-user-dropdown-head">
                <span className="navbar-user-dropdown-name">{user?.fullName || "User"}</span>
                <span className="navbar-user-dropdown-email">
                  {user?.email || user?.role?.name || "Signed in"}
                </span>
              </div>
              <button
                type="button"
                className="navbar-user-dropdown-item"
                role="menuitem"
                onClick={() => logout()}
              >
                <FontAwesomeIcon icon={faRightFromBracket} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
