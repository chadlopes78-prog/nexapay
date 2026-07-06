import { useState, useMemo, lazy, Suspense, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  BarChart3,
  Trash2,
  AlertTriangle,
  RefreshCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRangePicker, DateRangePreset } from "@/components/dashboard/DateRangePicker";
import { format, subDays, differenceInDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

// Lazy load chart (Recharts ~220KB)
const PerformanceChart = lazy(() => import("@/components/dashboard/PerformanceChart"));

function normalizeSaleStatus(s: string | null | undefined) {
  const v = (s || "").toLowerCase();
  if (["approved", "paid", "success"].includes(v)) return "approved";
  if (["failed", "error"].includes(v)) return "failed";
  if (["cancelled", "canceled"].includes(v)) return "cancelled";
  return "pending";
}

export const Route = createFileRoute("/_dashboard/dashboard")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "overview",
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    const saved = sessionStorage.getItem("dashboard-date-range");
    if (saved) {
      try {
        const { from, to } = JSON.parse(saved);
        return { from: new Date(from), to: new Date(to) };
      } catch (e) {
        console.error("Error parsing saved date range", e);
      }
    }
    return {
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    };
  });
  
  const [preset, setPreset] = useState<DateRangePreset>(() => {
    return (sessionStorage.getItem("dashboard-preset") as DateRangePreset) || "last7days";
  });

  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: dashboardData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-metrics", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      console.log("[Dashboard] Fetching metrics for range:", dateRange.from.toISOString(), "to", dateRange.to.toISOString());
      
      const { data, error } = await supabase.rpc('get_dashboard_metrics', {
        p_start_date: dateRange.from.toISOString(),
        p_end_date: dateRange.to.toISOString()
      });

      if (error) {
        console.error("[Dashboard] RPC Error details:", error);
        
        // Fallback for non-RPC data if it fails
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw error;

        console.log("[Dashboard] Falling back to direct query due to RPC error");
        const { data: sales, error: salesError } = await supabase
          .from("sales")
          .select("amount, status, created_at, products(name)")
          .eq("user_id", user.id)
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString());

        if (salesError) throw salesError;

        const stats = {
          total_transactions: sales.length,
          success_count: sales.filter(s => s.status && ["approved", "paid", "success"].includes(s.status)).length,
          failed_count: sales.filter(s => s.status && ["failed", "error", "cancelled", "canceled"].includes(s.status)).length,
          total_value: sales.reduce((acc, s) => acc + Number(s.amount), 0),
          received_value: sales.filter(s => s.status && ["approved", "paid", "success"].includes(s.status)).reduce((acc, s) => acc + Number(s.amount), 0),
          lost_value: sales.filter(s => s.status && ["failed", "error", "cancelled", "canceled"].includes(s.status)).reduce((acc, s) => acc + Number(s.amount), 0),
        };

        const recentSales = sales.slice(0, 10).map(s => ({
          ...s,
          product_name: (s.products as any)?.name
        }));

        // Group by day for chart
        const dailyMap = new Map();
        sales.forEach(s => {
          if (!s.created_at) return;
          const day = startOfDay(parseISO(s.created_at)).toISOString();
          const current = dailyMap.get(day) || { sucesso: 0, falha: 0 };
          if (s.status && ["approved", "paid", "success"].includes(s.status)) current.sucesso++;
          else if (s.status && ["failed", "error"].includes(s.status)) current.falha++;
          dailyMap.set(day, current);
        });

        const chartData = Array.from(dailyMap.entries()).map(([day, val]) => ({
          day,
          ...val
        }));

        return {
          stats,
          chartData,
          recentSales
        };
      }

      console.log("[Dashboard] RPC Data received:", data);

      const result = data as any;
      
      // Process chart data to ensure labels are formatted and empty days are handled
      const rawChartData = result.chartData || [];
      const stats = result.stats || {
        total_transactions: 0,
        success_count: 0,
        failed_count: 0,
        total_value: 0,
        received_value: 0,
        lost_value: 0
      };
      const recentSales = result.recentSales || [];

      const days = differenceInDays(dateRange.to, dateRange.from) + 1;
      const formattedChartData = [];
      
      for (let i = 0; i < days; i++) {
        const dayDate = startOfDay(subDays(dateRange.to, days - 1 - i));
        const dayStr = format(dayDate, "yyyy-MM-dd");
        const dayLabel = format(dayDate, "dd/MM", { locale: ptBR });
        
        const existingDay = rawChartData.find((d: any) => 
          d.day && format(parseISO(d.day), "yyyy-MM-dd") === dayStr
        );

        formattedChartData.push({
          name: dayLabel,
          sucesso: existingDay ? Number(existingDay.sucesso || 0) : 0,
          falha: existingDay ? Number(existingDay.falha || 0) : 0,
        });
      }

      return {
        stats,
        chartData: formattedChartData,
        recentSales
      };
    },
    staleTime: 1000 * 10, // 10 seconds for more "realtime" feel
    retry: 1,
  });

  // Sales in range for the revenue AreaChart (same as Desempenho do Checkout)
  const { data: rangeSales } = useQuery({
    queryKey: ["dashboard-range-sales", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("amount, status, created_at")
        .eq("user_id", user.id)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 10,
  });

  const revenueSeries = useMemo(() => {
    const map = new Map<string, { day: string; receita: number; aprovadas: number; falhas: number }>();
    (rangeSales || []).forEach((s: any) => {
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { day: key.slice(5), receita: 0, aprovadas: 0, falhas: 0 });
      const row = map.get(key)!;
      const st = normalizeSaleStatus(s.status);
      if (st === "approved") {
        row.receita += Number(s.amount || 0);
        row.aprovadas += 1;
      }
      if (st === "failed" || st === "cancelled") row.falhas += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [rangeSales]);


  const resetData = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // We use the same logic as in settings but centralized here if needed
      // Reset all user data safely
      await supabase.from("sales").delete().eq("user_id", user.id);
      
      const { data: userProducts } = await supabase
        .from("products")
        .select("id")
        .eq("user_id", user.id);
      
      const productIds = userProducts?.map(p => p.id) || [];

      if (productIds.length > 0) {
        const { data: userPages } = await supabase
          .from("traffic_pages")
          .select("id")
          .in("product_id", productIds);
        
        const pageIds = userPages?.map(p => p.id) || [];
        if (pageIds.length > 0) {
          await supabase.from("traffic_events").delete().in("page_id", pageIds);
        }
      }

      await supabase.from("notifications_log").delete().eq("user_id", user.id);
      await supabase.from("marketing_alerts").delete().eq("user_id", user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Dados resetados com sucesso!");
      setIsResetDialogOpen(false);
      setResetConfirmText("");
      refetch();
    },
    onError: (error: any) => {
      toast.error("Erro ao resetar: " + error.message);
    }
  });

  const handleRangeChange = (range: { from: Date; to: Date }, newPreset: DateRangePreset) => {
    setDateRange(range);
    setPreset(newPreset);
    sessionStorage.setItem("dashboard-date-range", JSON.stringify(range));
    sessionStorage.setItem("dashboard-preset", newPreset);
  };

  // Realtime: refresh dashboard the moment a sale is inserted/updated (e.g. status -> paid)
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user?.id) return;
      channel = supabase
        .channel(`dashboard-sales-${session.user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${session.user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
          }
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);



  const { heroKpis, metricCards } = useMemo(() => {
    if (!dashboardData) return { heroKpis: [], metricCards: [] };

    const { stats } = dashboardData;
    const total = Number(stats.total_transactions) || 0;
    const success = Number(stats.success_count) || 0;
    const received = Number(stats.received_value) || 0;
    const conversionRate = total > 0 ? (success / total) * 100 : 0;
    const avgTicket = success > 0 ? received / success : 0;

    const fmtMT = (v: number) =>
      `${Number(v).toLocaleString("pt-MZ", { maximumFractionDigits: 0 })} MT`;

    const heroKpis = [
      {
        title: "Valor líquido",
        value: fmtMT(received),
        description: "Recebido no período",
        icon: DollarSign,
        tone: "text-emerald-600",
        bg: "bg-emerald-50",
      },
      {
        title: "Taxa de conversão",
        value: `${conversionRate.toFixed(1)}%`,
        description: `${success} de ${total} tentativas`,
        icon: TrendingUp,
        tone: "text-violet-600",
        bg: "bg-violet-50",
      },
      {
        title: "Ticket médio",
        value: fmtMT(avgTicket),
        description: "Por venda aprovada",
        icon: CreditCard,
        tone: "text-slate-700",
        bg: "bg-slate-100",
      },
    ];

    const metricCards = [
      {
        title: "Transações",
        value: stats.total_transactions,
        description: "Volume total",
        icon: ShoppingCart,
        tone: "text-slate-600",
        bg: "bg-slate-100",
      },
      {
        title: "Aprovadas",
        value: stats.success_count,
        description: "Pagamentos confirmados",
        icon: TrendingUp,
        tone: "text-emerald-600",
        bg: "bg-emerald-50",
      },
      {
        title: "Recusadas",
        value: stats.failed_count,
        description: "Pagamentos não concluídos",
        icon: TrendingDown,
        tone: "text-rose-600",
        bg: "bg-rose-50",
      },
      {
        title: "Valor bruto",
        value: fmtMT(Number(stats.total_value)),
        description: "Soma de tentativas",
        icon: DollarSign,
        tone: "text-violet-600",
        bg: "bg-violet-50",
      },
      {
        title: "Valor perdido",
        value: fmtMT(Number(stats.lost_value)),
        description: "Oportunidades perdidas",
        icon: AlertCircle,
        tone: "text-amber-600",
        bg: "bg-amber-50",
      },
    ];

    return { heroKpis, metricCards };
  }, [dashboardData]);


  if (isLoading) return (
    <div className="space-y-6 pb-12 max-w-[1400px] mx-auto px-4 md:px-0 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-3 w-64 rounded-md" />
        </div>
        <Skeleton className="h-10 w-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-3xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    </div>
  );


  if (!dashboardData) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <AlertTriangle className="h-12 w-12 text-rose-500" />
      <p className="font-black text-slate-900 uppercase tracking-widest text-xs">Erro ao carregar dados. Tente atualizar a página.</p>
      <Button onClick={() => refetch()} variant="outline" size="sm" className="rounded-xl font-black uppercase tracking-tighter">
        <RefreshCcw className="mr-2 h-4 w-4" /> Tentar Novamente
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-[1400px] mx-auto px-4 md:px-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
            {isFetching && <RefreshCcw className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          <p className="text-sm text-slate-500 mt-1">Acompanhe suas vendas em tempo real.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker onRangeChange={handleRangeChange} initialPreset={preset} initialRange={dateRange} />

          <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-lg border-slate-200 text-slate-600 hover:bg-slate-50 gap-2 text-xs font-medium">
                <Trash2 className="h-3.5 w-3.5" />
                Resetar dados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md rounded-2xl border border-slate-200 shadow-xl">
              <AlertDialogHeader>
                <div className="flex items-center gap-3 text-rose-600 mb-2">
                  <div className="p-2.5 bg-rose-50 rounded-xl">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <AlertDialogTitle className="text-lg font-semibold">Limpar dados</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-slate-600">
                  Esta ação irá apagar todas as vendas e métricas do período selecionado. <span className="text-rose-600 font-medium">Irreversível.</span>
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="py-3 space-y-2">
                <p className="text-xs text-slate-500">Digite <span className="font-mono font-semibold text-slate-700">CONFIRMAR RESET</span> para prosseguir:</p>
                <Input
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="CONFIRMAR RESET"
                  className="h-11 rounded-lg"
                />
              </div>

              <AlertDialogFooter className="gap-2 sm:gap-0">
                <AlertDialogCancel className="h-10 rounded-lg">Cancelar</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={resetConfirmText !== "CONFIRMAR RESET" || resetData.isPending}
                  onClick={() => resetData.mutate()}
                  className="h-10 rounded-lg px-5"
                >
                  {resetData.isPending ? "Limpando..." : "Confirmar"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {heroKpis.map((kpi) => (
          <Card
            key={kpi.title}
            className="border border-slate-200/70 shadow-none bg-white rounded-xl hover:border-slate-300 transition-colors"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{kpi.title}</span>
                <div className={cn("p-2 rounded-lg", kpi.bg, kpi.tone)}>
                  <kpi.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 text-3xl font-semibold text-slate-900 tracking-tight">
                {kpi.value}
              </div>
              <p className="text-xs text-slate-500 mt-1">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metricCards.map((metric) => (
          <Card key={metric.title} className="border border-slate-200/70 shadow-none bg-white rounded-xl hover:border-slate-300 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium text-slate-500 leading-tight">{metric.title}</span>
                <div className={cn("p-1.5 rounded-md", metric.bg, metric.tone)}>
                  <metric.icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="text-lg font-semibold text-slate-900 tracking-tight truncate">{metric.value}</div>
              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{metric.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>




      <Card className="border border-slate-200/70 shadow-none bg-white rounded-xl">
        <CardHeader className="px-6 pt-5 pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-600" /> Vendas no período
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">Aprovadas vs recusadas por dia</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-2">
          <Suspense fallback={<div className="h-[320px] w-full rounded-lg bg-slate-50 animate-pulse" />}>
            <PerformanceChart data={dashboardData.chartData} />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="border border-slate-200/70 shadow-none bg-white rounded-xl">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Receita ao longo do tempo
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">Soma de vendas aprovadas por dia</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="gRevDash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <RTooltip />
                <Area type="monotone" dataKey="receita" stroke="#10b981" fill="url(#gRevDash)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200/70 shadow-none bg-white rounded-xl overflow-hidden">
        <CardHeader className="px-6 pt-5 pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Atividade recente</CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">Últimas transações do seu checkout</CardDescription>
        </CardHeader>
        <CardContent className="p-0 max-h-[420px] overflow-auto">
          {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {dashboardData.recentSales.map((sale: any) => {
                const approved = ["paid", "approved", "success"].includes(sale.status);
                const failed = ["failed", "error"].includes(sale.status);
                return (
                  <div key={sale.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center",
                        approved ? "bg-emerald-50 text-emerald-600" :
                        failed ? "bg-rose-50 text-rose-600" : "bg-violet-50 text-violet-600"
                      )}>
                        {approved ? <TrendingUp className="h-4 w-4" /> :
                         failed ? <TrendingDown className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {approved ? "Venda aprovada" : failed ? "Pagamento recusado" : "Novo pedido"}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-[240px]">
                          {sale.product_name || "Produto"} • {sale.customer_name || "Cliente"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {Number(sale.amount).toLocaleString("pt-MZ")} MT
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {format(parseISO(sale.created_at), "HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <div className="h-11 w-11 bg-slate-50 rounded-xl flex items-center justify-center mb-3">
                <ShoppingCart className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">Nenhuma atividade recente</p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
