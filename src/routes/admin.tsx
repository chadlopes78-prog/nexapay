import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  UserCheck,
  UserPlus,
  UserX,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Ban,
  Shield,
  LayoutDashboard,
  Clock,
  Mail,
  Filter,
  AlertTriangle,
  RefreshCcw,
  Eye,
  Package,
  DollarSign,
  Activity,
  ScrollText,
  ArrowLeft,
  Loader2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminControlCenter,
});

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "banned" | "suspended";
type SortKey = "created_at" | "last_login" | "full_name";
type ConfirmAction = {
  userId: string;
  status: string;
  label: string;
} | null;

const PAGE_SIZE = 20;

function AdminControlCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [authorized, setAuthorized] = useState<null | boolean>(null);
  const [tab, setTab] = useState<"users" | "audit">("users");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  // Backend-enforced access check via has_role RPC
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", sess.session.user.id)
        .eq("role", "super_admin")
        .limit(1);
      if (error || !roles?.length) {
        toast.error("Acesso negado. Área exclusiva do Super Administrador.");
        setAuthorized(false);
        navigate({ to: "/dashboard" });
        return;
      }
      setAuthorized(true);
    })();
  }, [navigate]);

  // -------- Metrics --------
  const metrics = useQuery({
    enabled: authorized === true,
    queryKey: ["admin-metrics"],
    queryFn: async () => {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [total, pending, approved, rejected, banned, today, month, products, sales, revenue] =
        await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "approved"),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "rejected"),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "banned"),
          supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startToday),
          supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startMonth),
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase.from("sales").select("*", { count: "exact", head: true }),
          supabase
            .from("sales")
            .select("amount")
            .in("status", ["approved", "paid", "success"]),
        ]);

      const totalRevenue = (revenue.data || []).reduce((s, r: any) => s + (Number(r.amount) || 0), 0);
      const activeUsers = approved.count || 0;

      return {
        total: total.count || 0,
        pending: pending.count || 0,
        approved: approved.count || 0,
        rejected: rejected.count || 0,
        banned: banned.count || 0,
        today: today.count || 0,
        month: month.count || 0,
        products: products.count || 0,
        sales: sales.count || 0,
        revenue: totalRevenue,
        activeUsers,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // -------- Users list --------
  const usersQuery = useQuery({
    enabled: authorized === true && tab === "users",
    queryKey: ["admin-users", page, search, statusFilter, sortKey],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .order(sortKey, { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
      }
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    },
    staleTime: 10_000,
  });

  // -------- Audit logs --------
  const audit = useQuery({
    enabled: authorized === true && tab === "audit",
    queryKey: ["admin-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // -------- Mutation: change status --------
  const updateStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const { data: sess } = await supabase.auth.getSession();
      const actor = sess.session?.user;
      const { error } = await supabase
        .from("profiles")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw error;
      await supabase.from("admin_audit_logs").insert({
        actor_id: actor?.id,
        actor_email: actor?.email,
        target_user_id: userId,
        action: `status:${status}`,
        details: { status },
      });
    },
    onSuccess: () => {
      toast.success("Status atualizado com sucesso");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  if (authorized === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verificando permissões...
        </div>
      </div>
    );
  }
  if (authorized === false) return null;

  const m = metrics.data;
  const totalPages = usersQuery.data ? Math.ceil(usersQuery.data.total / PAGE_SIZE) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
              <Shield className="h-4 w-4" />
              Super Admin · Controle do Sistema
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
              Painel Administrativo
            </h1>
            <p className="text-sm text-slate-500">
              Visão geral, gerenciamento de usuários e auditoria da plataforma.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                metrics.refetch();
                usersQuery.refetch();
                audit.refetch();
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Link to="/dashboard">
              <Button variant="outline" size="sm">
                <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <MetricCard label="Total de usuários" value={m?.total} icon={Users} tone="blue" />
          <MetricCard label="Usuários ativos" value={m?.activeUsers} icon={Activity} tone="emerald" />
          <MetricCard label="Pendentes" value={m?.pending} icon={Clock} tone="amber" />
          <MetricCard label="Aprovados" value={m?.approved} icon={UserCheck} tone="emerald" />
          <MetricCard label="Rejeitados" value={m?.rejected} icon={UserX} tone="slate" />
          <MetricCard label="Banidos" value={m?.banned} icon={Ban} tone="red" />
          <MetricCard label="Cadastros hoje" value={m?.today} icon={UserPlus} tone="violet" />
          <MetricCard label="Cadastros no mês" value={m?.month} icon={UserPlus} tone="indigo" />
          <MetricCard label="Produtos criados" value={m?.products} icon={Package} tone="sky" />
          <MetricCard label="Vendas processadas" value={m?.sales} icon={Activity} tone="cyan" />
          <MetricCard
            label="Receita da plataforma"
            value={m ? formatMZN(m.revenue) : undefined}
            icon={DollarSign}
            tone="emerald"
            wide
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200">
          <TabButton active={tab === "users"} onClick={() => setTab("users")} icon={Users}>
            Usuários
          </TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")} icon={ScrollText}>
            Auditoria
          </TabButton>
        </div>

        {tab === "users" && (
          <Card className="border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
            {/* Filters */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Pesquisar por nome ou e-mail..."
                  className="pl-9 h-10"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={statusFilter}
                  onValueChange={(v: StatusFilter) => {
                    setStatusFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-10 w-[160px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="approved">Aprovados</SelectItem>
                    <SelectItem value="rejected">Rejeitados</SelectItem>
                    <SelectItem value="banned">Banidos</SelectItem>
                    <SelectItem value="suspended">Suspensos</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortKey} onValueChange={(v: SortKey) => setSortKey(v)}>
                  <SelectTrigger className="h-10 w-[170px]">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Mais recentes</SelectItem>
                    <SelectItem value="last_login">Último acesso</SelectItem>
                    <SelectItem value="full_name">Nome (A-Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/60">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="pl-6 text-xs uppercase tracking-wider text-slate-500">Usuário</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500">Cadastro</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500">Último acesso</TableHead>
                    <TableHead className="text-right pr-6 text-xs uppercase tracking-wider text-slate-500">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5} className="py-3">
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : usersQuery.error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-10 text-center">
                        <div className="inline-flex flex-col items-center gap-2 text-slate-500">
                          <AlertTriangle className="h-6 w-6 text-red-500" />
                          <p>Falha ao carregar usuários.</p>
                          <Button variant="outline" size="sm" onClick={() => usersQuery.refetch()}>
                            Tentar novamente
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : usersQuery.data?.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-16 text-center text-slate-500">
                        Nenhum usuário encontrado com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usersQuery.data!.rows.map((u: any) => (
                      <TableRow key={u.id} className="hover:bg-slate-50/50 border-slate-100">
                        <TableCell className="pl-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-slate-100 grid place-items-center text-slate-500 font-bold">
                              {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">
                                {u.full_name || "Sem nome"}
                              </p>
                              <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {u.email || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(u.status)}</TableCell>
                        <TableCell className="text-sm text-slate-600">{fmtDate(u.created_at)}</TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {u.last_login ? fmtDateTime(u.last_login) : "Nunca"}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => setSelectedUser(u)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Detalhes
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={u.status === "approved"}
                                  onClick={() =>
                                    setConfirm({ userId: u.id, status: "approved", label: "aprovar" })
                                  }
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Aprovar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={u.status === "rejected"}
                                  onClick={() =>
                                    setConfirm({ userId: u.id, status: "rejected", label: "rejeitar" })
                                  }
                                >
                                  <XCircle className="h-4 w-4 mr-2 text-amber-600" /> Rejeitar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={u.status === "suspended"}
                                  onClick={() =>
                                    setConfirm({ userId: u.id, status: "suspended", label: "suspender" })
                                  }
                                >
                                  <Clock className="h-4 w-4 mr-2 text-slate-500" /> Suspender
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={u.status === "banned"}
                                  className="text-red-600 focus:text-red-700"
                                  onClick={() =>
                                    setConfirm({ userId: u.id, status: "banned", label: "banir" })
                                  }
                                >
                                  <Ban className="h-4 w-4 mr-2" /> Banir
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={u.status === "approved"}
                                  onClick={() =>
                                    setConfirm({ userId: u.id, status: "approved", label: "reativar" })
                                  }
                                >
                                  <RefreshCcw className="h-4 w-4 mr-2" /> Reativar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm">
              <p className="text-slate-500">
                {usersQuery.data?.total ?? 0} usuários · página {page + 1}
                {totalPages > 0 ? ` de ${totalPages}` : ""}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={usersQuery.data ? (page + 1) * PAGE_SIZE >= usersQuery.data.total : true}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {tab === "audit" && (
          <Card className="border-slate-200 shadow-sm bg-white rounded-xl">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Registros de Auditoria</h3>
              <p className="text-xs text-slate-500">Ações administrativas realizadas nos últimos registros.</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/60">
                  <TableRow>
                    <TableHead className="pl-6 text-xs uppercase tracking-wider text-slate-500">Quando</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500">Ator</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500">Ação</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500">Alvo</TableHead>
                    <TableHead className="pr-6 text-xs uppercase tracking-wider text-slate-500">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (audit.data || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center p-10 text-slate-500">
                        Nenhum registro de auditoria ainda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    audit.data!.map((row: any) => (
                      <TableRow key={row.id} className="border-slate-100">
                        <TableCell className="pl-6 text-sm text-slate-600">
                          {fmtDateTime(row.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">{row.actor_email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">
                          {row.target_user_id?.slice(0, 8) || "—"}
                        </TableCell>
                        <TableCell className="pr-6 text-xs text-slate-500">
                          {row.ip_address || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>

      {/* User details side panel */}
      <UserDetailsSheet
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
      />

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja <strong>{confirm?.label}</strong> este usuário? Esta ação será
              registrada nos logs de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) {
                  updateStatus.mutate({ userId: confirm.userId, status: confirm.status });
                  setConfirm(null);
                }
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --------------- Helpers / subcomponents --------------- */

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  wide,
}: {
  label: string;
  value: number | string | undefined;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "emerald" | "amber" | "red" | "slate" | "violet" | "indigo" | "sky" | "cyan";
  wide?: boolean;
}) {
  const toneMap: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    red: "text-red-600 bg-red-50",
    slate: "text-slate-600 bg-slate-100",
    violet: "text-violet-600 bg-violet-50",
    indigo: "text-indigo-600 bg-indigo-50",
    sky: "text-sky-600 bg-sky-50",
    cyan: "text-cyan-600 bg-cyan-50",
  };
  return (
    <Card
      className={cn(
        "border-slate-200 shadow-sm bg-white rounded-xl",
        wide && "col-span-2 md:col-span-3 lg:col-span-4",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className={cn("h-9 w-9 grid place-items-center rounded-lg", toneMap[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mt-3">{label}</p>
        <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
          {value === undefined ? <Skeleton className="h-7 w-16" /> : value}
        </p>
      </CardContent>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors -mb-px",
        active
          ? "border-primary text-primary"
          : "border-transparent text-slate-500 hover:text-slate-800",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function statusBadge(status?: string) {
  const map: Record<string, string> = {
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    rejected: "bg-slate-50 text-slate-700 border-slate-200",
    banned: "bg-red-50 text-red-700 border-red-200",
    suspended: "bg-orange-50 text-orange-700 border-orange-200",
  };
  const label: Record<string, string> = {
    approved: "Aprovado",
    pending: "Pendente",
    rejected: "Rejeitado",
    banned: "Banido",
    suspended: "Suspenso",
  };
  const key = status || "pending";
  return (
    <Badge variant="outline" className={cn("font-medium", map[key] || map.pending)}>
      {label[key] || key}
    </Badge>
  );
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}
function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function formatMZN(v: number) {
  return new Intl.NumberFormat("pt-MZ", {
    style: "currency",
    currency: "MZN",
    maximumFractionDigits: 0,
  }).format(v);
}

function UserDetailsSheet({ user, onClose }: { user: any | null; onClose: () => void }) {
  const details = useQuery({
    enabled: !!user,
    queryKey: ["admin-user-details", user?.id],
    queryFn: async () => {
      const [products, sales, revenue] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("sales").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("sales")
          .select("amount")
          .eq("user_id", user.id)
          .in("status", ["approved", "paid", "success"]),
      ]);
      const total = (revenue.data || []).reduce((s, r: any) => s + (Number(r.amount) || 0), 0);
      return {
        productsCount: products.count || 0,
        salesCount: sales.count || 0,
        revenue: total,
      };
    },
  });

  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {user && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 grid place-items-center text-slate-500 font-bold">
                  {(user.full_name || user.email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate">{user.full_name || "Sem nome"}</p>
                  <p className="text-xs text-slate-500 font-normal truncate">{user.email}</p>
                </div>
              </SheetTitle>
              <SheetDescription>Detalhes completos do usuário</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Produtos" value={details.data?.productsCount ?? "…"} icon={Package} />
                <MiniStat label="Vendas" value={details.data?.salesCount ?? "…"} icon={Activity} />
                <MiniStat
                  label="Receita"
                  value={details.data ? formatMZN(details.data.revenue) : "…"}
                  icon={DollarSign}
                />
              </div>

              <InfoRow label="Status" value={statusBadge(user.status)} />
              <InfoRow label="ID" value={<span className="font-mono text-xs">{user.id}</span>} />
              <InfoRow label="E-mail" value={user.email || "—"} />
              <InfoRow label="Data de cadastro" value={fmtDateTime(user.created_at)} />
              <InfoRow label="Último acesso" value={user.last_login ? fmtDateTime(user.last_login) : "Nunca"} />
              <InfoRow label="Função do perfil" value={user.role || "user"} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <Icon className="h-4 w-4 text-slate-400" />
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-2 font-medium">{label}</p>
      <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100">
      <span className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value}</span>
    </div>
  );
}
