import { NavLink } from "react-router-dom";

export default function PurchaseTabs() {
  return (
    <nav className="stock-tab-nav mb-4 shrink-0" aria-label="Purchase sections">
      <NavLink
        to="/purchases"
        end
        className={({ isActive }) => `stock-tab-btn ${isActive ? "active" : ""}`}
      >
        Orders
      </NavLink>
      <NavLink
        to="/purchases/rates"
        className={({ isActive }) => `stock-tab-btn ${isActive ? "active" : ""}`}
      >
        Vendor rates
      </NavLink>
    </nav>
  );
}
