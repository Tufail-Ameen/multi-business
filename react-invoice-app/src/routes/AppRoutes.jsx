import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAuth, RequirePermission } from "../auth/guards";
import DashboardLayout from "../layouts/DashboardLayout";
import { PERMISSIONS } from "../lib/permissions";
import ClientDetailPage from "../pages/ClientDetailPage";
import ClientsPage from "../pages/ClientsPage";
import ForbiddenPage from "../pages/ForbiddenPage";
import InvoiceDetailPage from "../pages/InvoiceDetailPage";
import InvoicesPage from "../pages/InvoicesPage";
import LandingPage from "../pages/LandingPage";
import LoginPage from "../pages/LoginPage";
import PublicRateListPage from "../pages/PublicRateListPage";
import PurchaseDetailPage from "../pages/PurchaseDetailPage";
import PurchaseFormPage from "../pages/PurchaseFormPage";
import PurchasesPage from "../pages/PurchasesPage";
import ClientRateListsPage from "../pages/ClientRateListsPage";
import RateListDetailPage from "../pages/RateListDetailPage";
import RateListEditorPage from "../pages/RateListEditorPage";
import RateListsPage from "../pages/RateListsPage";
import RegisterPage from "../pages/RegisterPage";
import StockPage from "../pages/StockPage";
import SupplierDetailPage from "../pages/SupplierDetailPage";
import SuppliersPage from "../pages/SuppliersPage";
import PlatformBusinessesPage from "../pages/platform/PlatformBusinessesPage";
import AuditLogPage from "../pages/team/AuditLogPage";
import TeamRolesPage from "../pages/team/TeamRolesPage";
import TeamUsersPage from "../pages/team/TeamUsersPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/share/rate-lists/:token" element={<PublicRateListPage />} />

      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route
            path="/invoices"
            element={
              <RequirePermission permission={PERMISSIONS.INVOICES_VIEW}>
                <InvoicesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/invoices/:id"
            element={
              <RequirePermission permission={PERMISSIONS.INVOICES_VIEW}>
                <InvoiceDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/clients"
            element={
              <RequirePermission permission={PERMISSIONS.CLIENTS_VIEW}>
                <ClientsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/clients/:id"
            element={
              <RequirePermission permission={PERMISSIONS.CLIENTS_VIEW}>
                <ClientDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/rate-lists"
            element={
              <RequirePermission permission={PERMISSIONS.RATE_LISTS_VIEW}>
                <RateListsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/rate-lists/new"
            element={
              <RequirePermission permission={PERMISSIONS.RATE_LISTS_CREATE}>
                <RateListEditorPage />
              </RequirePermission>
            }
          />
          <Route
            path="/rate-lists/clients"
            element={
              <RequirePermission permission={PERMISSIONS.RATE_LISTS_VIEW}>
                <ClientRateListsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/rate-lists/:id"
            element={
              <RequirePermission permission={PERMISSIONS.RATE_LISTS_VIEW}>
                <RateListDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/stock"
            element={
              <RequirePermission permission={PERMISSIONS.PRODUCTS_VIEW}>
                <StockPage />
              </RequirePermission>
            }
          />

          <Route
            path="/suppliers"
            element={
              <RequirePermission permission={PERMISSIONS.SUPPLIERS_VIEW}>
                <SuppliersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/suppliers/:id"
            element={
              <RequirePermission permission={PERMISSIONS.SUPPLIERS_VIEW}>
                <SupplierDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/purchases"
            element={
              <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW}>
                <PurchasesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/purchases/new"
            element={
              <RequirePermission permission={PERMISSIONS.PURCHASES_CREATE}>
                <PurchaseFormPage />
              </RequirePermission>
            }
          />
          <Route
            path="/purchases/:id/edit"
            element={
              <RequirePermission permission={PERMISSIONS.PURCHASES_UPDATE}>
                <PurchaseFormPage />
              </RequirePermission>
            }
          />
          <Route
            path="/purchases/:id"
            element={
              <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW}>
                <PurchaseDetailPage />
              </RequirePermission>
            }
          />

          <Route
            path="/team/users"
            element={
              <RequirePermission permission={PERMISSIONS.USERS_VIEW}>
                <TeamUsersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/team/roles"
            element={
              <RequirePermission permission={PERMISSIONS.ROLES_VIEW}>
                <TeamRolesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/team/audit"
            element={
              <RequirePermission permission={PERMISSIONS.AUDIT_VIEW}>
                <AuditLogPage />
              </RequirePermission>
            }
          />

          <Route
            path="/platform/businesses"
            element={
              <RequirePermission permission={PERMISSIONS.PLATFORM_MANAGE_BUSINESSES}>
                <PlatformBusinessesPage />
              </RequirePermission>
            }
          />

          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="*" element={<Navigate to="/invoices" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
