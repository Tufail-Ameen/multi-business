import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { filterNavByPermission, mainNavLinks, teamNavLinks } from "./navLinks";

export default function BottomNav() {
  const { can } = useAuth();
  const links = [
    ...filterNavByPermission(mainNavLinks, can),
    ...filterNavByPermission(teamNavLinks.slice(0, 1), can),
  ].slice(0, 4);

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `bottom-nav-link ${isActive ? "active" : ""}`}
        >
          <FontAwesomeIcon icon={link.icon} />
          <span>{link.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
