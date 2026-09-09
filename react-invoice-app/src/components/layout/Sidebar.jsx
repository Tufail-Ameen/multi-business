import {
  faChevronLeft,
  faChevronRight,
  faFileInvoice,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  filterNavByPermission,
  mainNavLinks,
  platformNavLinks,
  teamNavLinks,
} from "./navLinks";
import { useSidebar } from "./SidebarContext";

function NavSection({ label, links, collapsed }) {
  if (!links.length) return null;
  return (
    <div className="sidebar-section">
      {collapsed ? (
        <span className="sidebar-section-rule" aria-hidden="true" />
      ) : (
        <p className="sidebar-section-label">{label}</p>
      )}
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          title={collapsed ? link.label : undefined}
          className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
        >
          <span className="sidebar-link-icon">
            <FontAwesomeIcon icon={link.icon} />
          </span>
          <span className="sidebar-link-label">{link.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const { user, can } = useAuth();
  const { collapsed, toggleSidebar } = useSidebar();
  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "??";

  const main = filterNavByPermission(mainNavLinks, can);
  const team = filterNavByPermission(teamNavLinks, can);
  const platform = filterNavByPermission(platformNavLinks, can);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <NavLink to="/invoices" className="sidebar-brand" aria-label="Invoice App home">
          <span className="sidebar-brand-icon">
            <FontAwesomeIcon icon={faFileInvoice} />
          </span>
          <span className="sidebar-brand-copy">
            <span className="sidebar-brand-name">Invoice App</span>
            <span className="sidebar-brand-tagline">Multi-business platform</span>
          </span>
        </NavLink>
      </div>

      <button
        type="button"
        className="sidebar-collapse-btn"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} />
      </button>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <NavSection label="Workspace" links={main} collapsed={collapsed} />
        <NavSection label="Team" links={team} collapsed={collapsed} />
        <NavSection label="Platform" links={platform} collapsed={collapsed} />
      </nav>

      <div className="sidebar-profile">
        <div className="sidebar-profile-card" title={collapsed ? user?.fullName : undefined}>
          <span className="sidebar-avatar">{initials}</span>
          <div className="sidebar-profile-meta">
            <span className="sidebar-profile-name">{user?.fullName || "User"}</span>
            <span className="sidebar-profile-email">
              {user?.role?.name || user?.email || "Signed in"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
