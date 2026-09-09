import { Outlet } from "react-router-dom";
import BottomNav from "../components/layout/BottomNav";
import MobileHeader from "../components/layout/MobileHeader";
import Navbar from "../components/layout/Navbar";
import Sidebar from "../components/layout/Sidebar";
import { SidebarProvider, useSidebar } from "../components/layout/SidebarContext";

function DashboardShell() {
  const { collapsed } = useSidebar();

  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <Sidebar />
      <div className="app-main">
        <Navbar />
        <MobileHeader />
        <main className="app-content">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <DashboardShell />
    </SidebarProvider>
  );
}
