import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/auth" });
      } else {
        setUser(session.user);
      }
    };
    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/auth" });
      else setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { name: "Produtos", icon: Package, path: "/products" },
    { name: "Vendas", icon: CreditCard, path: "/sales" },
    { name: "Clientes", icon: Users, path: "/customers" },
    { name: "Relatórios", icon: BarChart3, path: "/dashboard" },
    { name: "Pixel Facebook", icon: BarChart3, path: "/pixel" },
    { name: "Configurações", icon: Settings, path: "/settings" },
  ];

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-slate-50/50">
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r bg-white transition-all duration-300",
          isSidebarOpen ? "w-64" : "w-20",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center px-6">
            <Link to="/dashboard" className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              {isSidebarOpen && (
                <span className="text-lg font-bold tracking-tight truncate">CheckoutPro</span>
              )}
            </Link>
          </div>

          <Separator />

          <nav className="flex-1 space-y-1 p-3">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100",
                  location.pathname === item.path ? "bg-primary/5 text-primary" : "text-slate-600",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {isSidebarOpen && <span>{item.name}</span>}
              </Link>
            ))}
          </nav>

          <div className="p-3">
            <Separator className="mb-3" />
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-red-600"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {isSidebarOpen && <span>Sair</span>}
            </button>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="mt-2 flex w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            >
              {isSidebarOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

      <main className={cn("flex-1 transition-all duration-300", isSidebarOpen ? "ml-64" : "ml-20")}>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
