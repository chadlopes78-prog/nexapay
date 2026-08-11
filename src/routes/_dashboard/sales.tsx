import { createFileRoute } from "@tanstack/react-router";
import {
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  XCircle,
  ShoppingCart,
  DollarSign,
  Percent,
  Wallet,
  Eye,
  Info,
  Trash2,

} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

type SaleProduct = { name?: string | null } | null;
type Sale = {
  id: string;
  amount: number;
  status: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  transaction_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  product_id: string | null;
  products?: SaleProduct;
  traffic_page_id?: string | null;
  failure_reason?: string | null;
  failure_code?: string | null;
};


const STATUS_LABEL: Record<string, string> = {
  approved: "Aprovado",
  paid: "Aprovado",
  success: "Aprovado",
  pending: "Pendente",
  processing: "Processando",
  failed: "Falhou",
  error: "Falhou",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  refunded: "Reembolsado",
};

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-700",
  refunded: "bg-orange-100 text-orange-700",
};

const FAILURE_HINTS: Record<string, string> = {
  insufficient_funds: "Saldo insuficiente na conta do cliente",
  wallet_unavailable: "Carteira do vendedor indisponível",
  timeout: "Tempo expirado — cliente não introduziu o PIN",
  invalid_data: "Dados de pagamento inválidos",
  invalid_pin: "PIN incorreto — pagamento recusado",
  cancelled_by_user: "Pagamento cancelado pelo cliente",
  gateway_auth_error: "Falha de autenticação com a gateway",
  gateway_unavailable: "Gateway indisponível — falha de comunicação",
  payment_failed: "Pagamento recusado pela operadora",
  internal_error: "Erro interno no processamento",
};

function justificationFor(sale: Pick<Sale, "status" | "failure_reason" | "failure_code">) {
  const st = (sale.status || "").toLowerCase();
  if (!["failed", "error", "cancelled", "canceled"].includes(st)) return "—";
  if (sale.failure_reason && sale.failure_reason.trim()) return sale.failure_reason;
  if (sale.failure_code && FAILURE_HINTS[sale.failure_code]) return FAILURE_HINTS[sale.failure_code];
  return "Pagamento cancelado ou recusado pela operadora";
}


function normalizeStatus(s: string | null | undefined) {
  const v = (s || "").toLowerCase();
  if (["approved", "paid", "success"].includes(v)) return "approved";
  if (["failed", "error"].includes(v)) return "failed";
  if (["cancelled", "canceled"].includes(v)) return "cancelled";
  if (v === "refunded") return "refunded";
  if (v === "processing") return "processing";
  return "pending";
}

function formatMZ(v: number) {
  return `${Number(v || 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}

type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "last_month" | "all";

function getRangeForPreset(p: Preset): { from: Date | null; to: Date | null } {
  const now = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (p) {
    case "today":
      return { from: start(now), to: end(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: start(y), to: end(y) };
    }
    case "7d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 6);
      return { from: start(f), to: end(now) };
    }
    case "30d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 29);
      return { from: start(f), to: end(now) };
    }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: end(now) };
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: f, to: t };
    }
    default:
      return { from: null, to: null };
  }
}

export const Route = createFileRoute("/_dashboard/sales")({
  component: SalesPage,
});

function SalesPage() {
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<Preset>("30d");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Sale | null>(null);
  const [clearing, setClearing] = useState(false);

  const handleClearData = async () => {
    setClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Sessão inválida");
      const { error } = await supabase
        .from("sales")
        .delete()
        .eq("user_id", session.user.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Dados de vendas apagados com sucesso");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao apagar dados");
    } finally {
      setClearing(false);
    }
  };


  const { data: sales, isLoading } = useQuery<Sale[]>({
    queryKey: ["sales"],
    queryFn: async () => {
      // Cada utilizador (incluindo admin) vê apenas as suas próprias vendas.
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*, products(name)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Sale[];
    },
    staleTime: 5_000,
  });


  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session?.user?.id) return;
      channel = supabase
        .channel(`sales-list-${session.user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${session.user.id}` },
          () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const range = getRangeForPreset(preset);

  const filtered = useMemo<Sale[]>(() => {
    if (!sales) return [];
    return sales.filter((s) => {
      const created = new Date(s.created_at);
      if (range.from && created < range.from) return false;
      if (range.to && created > range.to) return false;
      if (productFilter !== "all" && s.product_id !== productFilter) return false;
      if (methodFilter !== "all" && (s.payment_method || "") !== methodFilter) return false;
      if (statusFilter !== "all" && normalizeStatus(s.status) !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${s.customer_name || ""} ${s.customer_phone || ""} ${s.payment_reference || ""} ${s.transaction_id || ""} ${(s.products?.name || "")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sales, range.from, range.to, productFilter, methodFilter, statusFilter, search]);

  const products = useMemo(() => {
    const m = new Map<string, string>();
    (sales || []).forEach((s) => {
      if (s.product_id) m.set(s.product_id, s.products?.name || "Produto");
    });
    return Array.from(m.entries());
  }, [sales]);

  const methods = useMemo(() => {
    const set = new Set<string>();
    (sales || []).forEach((s) => s.payment_method && set.add(s.payment_method));
    return Array.from(set);
  }, [sales]);

  const metrics = useMemo(() => {
    const approved = filtered.filter((s) => normalizeStatus(s.status) === "approved");
    const pending = filtered.filter((s) => normalizeStatus(s.status) === "pending");
    const failed = filtered.filter((s) => ["failed", "cancelled"].includes(normalizeStatus(s.status)));
    const approvedRevenue = approved.reduce((a, s) => a + Number(s.amount || 0), 0);
    const totalProcessed = filtered.reduce((a, s) => a + Number(s.amount || 0), 0);
    const conversion = filtered.length ? (approved.length / filtered.length) * 100 : 0;
    const avgTicket = approved.length ? approvedRevenue / approved.length : 0;
    return {
      approvedRevenue,
      totalProcessed,
      conversion,
      approvedCount: approved.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      abandonCount: pending.length, // proxy sem tabela dedicada
      avgTicket,
      total: filtered.length,
    };
  }, [filtered]);

  const revenueSeries = useMemo(() => {
    const map = new Map<string, { day: string; receita: number; aprovadas: number; falhas: number }>();
    filtered.forEach((s) => {
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { day: key.slice(5), receita: 0, aprovadas: 0, falhas: 0 });
      const row = map.get(key)!;
      const st = normalizeStatus(s.status);
      if (st === "approved") {
        row.receita += Number(s.amount || 0);
        row.aprovadas += 1;
      }
      if (st === "failed" || st === "cancelled") row.falhas += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [filtered]);

  const methodShare = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((s) => {
      const k = s.payment_method || "outro";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const hourlyVolume = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, "0")}h`, vendas: 0 }));
    filtered.forEach((s) => {
      if (normalizeStatus(s.status) !== "approved") return;
      const h = new Date(s.created_at).getHours();
      arr[h].vendas += 1;
    });
    return arr;
  }, [filtered]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
              Desempenho do Checkout
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Monitore em tempo real todas as transações, falhas e conversão.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-[180px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês anterior</SelectItem>
                <SelectItem value="all">Tudo</SelectItem>
              </SelectContent>
            </Select>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  disabled={clearing || !sales?.length}
                >
                  <Trash2 className="h-4 w-4" />
                  Limpar dados
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar todos os dados de vendas?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acção é irreversível. Todas as suas vendas (aprovadas, pendentes e falhas) serão permanentemente removidas e as métricas do checkout serão zeradas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearData}
                    className="bg-rose-600 hover:bg-rose-700"
                  >
                    Sim, apagar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={DollarSign}
            label="Receita Aprovada"
            value={formatMZ(metrics.approvedRevenue)}
            tone="emerald"
            hint="Soma de todas as vendas aprovadas no período."
          />
          <MetricCard
            icon={Wallet}
            label="Total Processado"
            value={formatMZ(metrics.totalProcessed)}
            tone="slate"
            hint="Valor total de tentativas de pagamento (aprovadas, pendentes e falhas)."
          />
          <MetricCard
            icon={Percent}
            label="Taxa de Conversão"
            value={`${metrics.conversion.toFixed(1)}%`}
            tone="violet"
            hint="Percentual de pagamentos aprovados em relação ao total de tentativas."
            trend={metrics.conversion >= 50 ? "up" : "down"}
          />
          <MetricCard
            icon={ShoppingCart}
            label="Ticket Médio"
            value={formatMZ(metrics.avgTicket)}
            tone="blue"
            hint="Valor médio por venda aprovada."
          />
          <MetricCard
            icon={CheckCircle2}
            label="Aprovados"
            value={String(metrics.approvedCount)}
            tone="emerald"
            hint="Quantidade de pagamentos aprovados."
          />
          <MetricCard
            icon={Clock}
            label="Pendentes"
            value={String(metrics.pendingCount)}
            tone="amber"
            hint="Aguardando confirmação do provedor."
          />
          <MetricCard
            icon={XCircle}
            label="Falhas"
            value={String(metrics.failedCount)}
            tone="rose"
            hint="Pagamentos recusados ou com erro."
          />
          <MetricCard
            icon={TrendingDown}
            label="Abandono"
            value={String(metrics.abandonCount)}
            tone="orange"
            hint="Clientes que iniciaram e não concluíram."
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-slate-200/70 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Receita ao longo do tempo</h3>
                <p className="text-xs text-slate-500">Aprovações e falhas por dia no período.</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <RTooltip />
                  <Area type="monotone" dataKey="receita" stroke="#10b981" fill="url(#gRev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Métodos de pagamento</h3>
            <p className="text-xs text-slate-500 mb-3">Distribuição por método.</p>
            <div className="h-64">
              {methodShare.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={methodShare} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                      {methodShare.map((_, i) => (
                        <Cell key={i} fill={["#10b981", "#f59e0b", "#6366f1", "#ef4444", "#0ea5e9"][i % 5]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/70 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Vendas aprovadas por hora</h3>
          <p className="text-xs text-slate-500 mb-3">Horários com maior volume.</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyVolume}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hora" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <RTooltip />
                <Bar dataKey="vendas" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-slate-200/70 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, referência ou transação..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Produto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os produtos</SelectItem>
                {products.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os métodos</SelectItem>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { setProductFilter("all"); setMethodFilter("all"); setStatusFilter("all"); setSearch(""); }}>
              <Filter className="h-4 w-4 mr-1.5" /> Limpar
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200/70 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-left px-4 py-3 font-medium">Método</th>
                  <th className="text-right px-4 py-3 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Justificativa</th>
                  <th className="text-right px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-500">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-500">Nenhuma transação no período.</td></tr>
                ) : (
                  filtered.map((s) => {
                    const st = normalizeStatus(s.status);
                    const created = new Date(s.created_at);
                    const justification = justificationFor(s);

                    return (
                      <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="text-slate-900">{created.toLocaleDateString("pt-MZ")}</div>
                          <div className="text-xs text-slate-500">{created.toLocaleTimeString("pt-MZ", { hour: "2-digit", minute: "2-digit" })}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{s.customer_name || "—"}</div>
                          <div className="text-xs text-slate-500">{s.customer_phone || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">
                          {s.products?.name || "Produto removido"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="capitalize text-[10px]">{s.payment_method || "—"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMZ(Number(s.amount))}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLES[st])}>
                            {STATUS_LABEL[s.status || ""] || STATUS_LABEL[st] || s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px]" title={justification}><span className="line-clamp-2">{justification}</span></td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelected(s)}>
                            <Eye className="h-4 w-4 mr-1" /> Ver
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail sheet */}
        <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent className="sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Detalhes da transação</SheetTitle>
            </SheetHeader>
            {selected && <TransactionDetail sale={selected} />}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  trend,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "slate" | "violet" | "blue" | "amber" | "rose" | "orange";
  trend?: "up" | "down";
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-100 text-slate-700",
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className={cn("grid h-9 w-9 place-items-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-slate-300 hover:text-slate-500" tabIndex={-1}>
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[220px] text-xs">{hint}</TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-lg font-bold text-slate-900 tracking-tight">{value}</p>
        {trend && (
          <span className={cn("text-[10px] font-medium", trend === "up" ? "text-emerald-600" : "text-rose-600")}>
            {trend === "up" ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full grid place-items-center text-xs text-slate-400">
      Sem dados no período.
    </div>
  );
}

function TransactionDetail({ sale }: { sale: Sale }) {
  const st = normalizeStatus(sale.status);
  const created = new Date(sale.created_at);
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Valor</span>
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLES[st])}>
            {STATUS_LABEL[sale.status || ""] || STATUS_LABEL[st]}
          </span>
        </div>
        <p className="mt-1 text-2xl font-bold text-slate-900">{formatMZ(Number(sale.amount))}</p>
      </div>

      <DetailRow label="Cliente" value={sale.customer_name || "—"} />
      <DetailRow label="Telefone" value={sale.customer_phone || "—"} />
      <DetailRow label="Produto" value={sale.products?.name || "—"} />
      <DetailRow label="Método" value={sale.payment_method || "—"} />
      <DetailRow label="Referência" value={sale.payment_reference || "—"} mono />
      <DetailRow label="ID da transação" value={sale.transaction_id || sale.id} mono />
      <DetailRow label="Criado em" value={created.toLocaleString("pt-MZ")} />
      {(st === "failed" || st === "cancelled") && (
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
          <p className="font-semibold mb-1">Justificativa</p>
          <p>{justificationFor(sale)}</p>
          {sale.failure_code && (
            <p className="mt-1 font-mono text-[10px] text-rose-500">código: {sale.failure_code}</p>
          )}
        </div>
      )}

    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className={cn("text-right text-slate-900 max-w-[60%] break-all", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}
