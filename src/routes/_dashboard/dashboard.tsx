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
  Calendar as CalendarIcon,
  Trash2,
  AlertTriangle,
  RefreshCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRangePicker, DateRangePreset } from "@/components/dashboard/DateRangePicker";
import { format, subDays, differenceInDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
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

// Lazy load complex components
const PushNotificationManager = lazy(() => import("@/components/dashboard/PushNotificationManager").then(m => ({ default: m.PushNotificationManager })));

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

  useEffect(() => {
    // Listen for realtime sale updates to refresh dashboard immediately
    // Using user-specific channel would be better, but sales don't have RLS per user ID easily filterable here
    // unless we use the new user_id column
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales'
        },
        () => {
          console.log("[Dashboard] Realtime sale change detected, refreshing...");
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: dashboardData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-metrics", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_metrics', {
        p_start_date: dateRange.from.toISOString(),
        p_end_date: dateRange.to.toISOString()
      });

      if (error) {
        console.error("Error fetching metrics from RPC:", error);
        throw error;
      }

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

  const resetData = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // We use the same logic as in settings but centralized here if needed
      const { data: userProducts } = await supabase
        .from("products")
        .select("id")
        .eq("user_id", user.id);
      
      const productIds = userProducts?.map(p => p.id) || [];

      if (productIds.length > 0) {
        await supabase.from("sales").delete().in("product_id", productIds);
        
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

  const metricCards = useMemo(() => {
    if (!dashboardData) return [];
    
    const { stats } = dashboardData;
    
    return [
      {
        title: "Total de Transações",
        value: stats.total_transactions,
        description: "Volume total de pedidos",
        icon: ShoppingCart,
        color: "bg-slate-900",
      },
      {
        title: "Vendas com Sucesso",
        value: stats.success_count,
        description: "Pagamentos confirmados",
        icon: TrendingUp,
        color: "bg-emerald-500",
      },
      {
        title: "Vendas com Falha",
        value: stats.failed_count,
        description: "Pagamentos não concluídos",
        icon: TrendingDown,
        color: "bg-rose-500",
      },
      {
        title: "Valor Total",
        value: `${Number(stats.total_value).toLocaleString("pt-MZ")} MT`,
        description: "Soma de todas as tentativas",
        icon: DollarSign,
        color: "bg-blue-600",
      },
      {
        title: "Valor Recebido",
        value: `${Number(stats.received_value).toLocaleString("pt-MZ")} MT`,
        description: "Dinheiro real em caixa",
        icon: CreditCard,
        color: "bg-emerald-600",
      },
      {
        title: "Valor Perdido",
        value: `${Number(stats.lost_value).toLocaleString("pt-MZ")} MT`,
        description: "Oportunidades perdidas",
        icon: AlertCircle,
        color: "bg-rose-600",
      },
    ];
  }, [dashboardData]);

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
      <p className="font-bold text-slate-500 uppercase tracking-widest text-xs">Carregando métricas...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-[1400px] mx-auto px-4 md:px-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Dashboard</h1>
            {isFetching && <RefreshCcw className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-tighter">Relatórios em tempo real sincronizados com Checkout.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker onRangeChange={handleRangeChange} initialPreset={preset} initialRange={dateRange} />
          
          <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 gap-2 font-black uppercase tracking-tighter text-[10px]">
                <Trash2 className="h-3.5 w-3.5" />
                Resetar Dados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md rounded-3xl border-none shadow-2xl">
              <AlertDialogHeader>
                <div className="flex items-center gap-3 text-red-600 mb-2">
                  <div className="p-3 bg-red-100 rounded-2xl">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <AlertDialogTitle className="text-2xl font-black uppercase tracking-tighter">Limpeza de Dados</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-slate-600 font-bold">
                  Esta ação irá apagar todas as vendas e métricas do período selecionado. <span className="text-red-600">Irreversível.</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <div className="py-4 space-y-3">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Digite CONFIRMAR RESET para prosseguir:</p>
                <Input 
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="CONFIRMAR RESET"
                  className="h-12 border-2 text-center font-black uppercase tracking-widest focus-visible:ring-red-500 rounded-2xl"
                />
              </div>

              <AlertDialogFooter className="gap-2 sm:gap-0">
                <AlertDialogCancel className="h-12 rounded-2xl font-black uppercase tracking-tighter border-2">Sair</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={resetConfirmText !== "CONFIRMAR RESET" || resetData.isPending}
                  onClick={() => resetData.mutate()}
                  className="h-12 rounded-2xl font-black uppercase tracking-tighter px-6"
                >
                  {resetData.isPending ? "Limpando..." : "Confirmar Reset"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((metric) => (
          <Card key={metric.title} className="border-none shadow-sm bg-white overflow-hidden transition-all hover:shadow-lg group">
            <div className={cn("h-1 w-full transition-all group-hover:h-2", metric.color)} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{metric.title}</span>
              <metric.icon className="h-4 w-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-slate-900 tracking-tighter">{metric.value}</div>
              <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tighter">{metric.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-none shadow-xl bg-white p-6 rounded-3xl">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Gráfico de Performance
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase text-slate-400">Conversão diária de vendas (Sucesso vs Falha)</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-8">
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData?.chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '15px' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', paddingBottom: '30px' }}
                  />
                  <Bar dataKey="sucesso" fill="#10b981" radius={[6, 6, 0, 0]} name="PAGO" barSize={20} />
                  <Bar dataKey="falha" fill="#f43f5e" radius={[6, 6, 0, 0]} name="FALHA" barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden ring-1 ring-slate-100 flex flex-col">
          <CardHeader className="bg-slate-50/50 border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-primary" /> Atividade Recente
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase text-slate-400">
                  Alertas em tempo real do seu checkout.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 font-black text-[10px] uppercase">Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[400px]">
            {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {dashboardData.recentSales.map((sale: any) => (
                  <div key={sale.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center shadow-sm",
                        ["paid", "approved", "success"].includes(sale.status) ? "bg-emerald-100 text-emerald-600" : 
                        ["failed", "error"].includes(sale.status) ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                      )}>
                        {["paid", "approved", "success"].includes(sale.status) ? <TrendingUp className="h-5 w-5" /> : 
                         ["failed", "error"].includes(sale.status) ? <TrendingDown className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tighter">
                          {["paid", "approved", "success"].includes(sale.status) ? "Venda Aprovada" : 
                           ["failed", "error"].includes(sale.status) ? "Pagamento Falhou" : "Novo Pedido"}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[150px]">
                          {sale.product_name || "Produto"} • {sale.customer_name || "Cliente"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-900">
                        {Number(sale.amount).toLocaleString("pt-MZ")} MT
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">
                        {format(parseISO(sale.created_at), "HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                  <ShoppingCart className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma atividade recente</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Suspense fallback={<div className="h-64 bg-white rounded-3xl animate-pulse shadow-sm" />}>
          <PushNotificationManager />
        </Suspense>
      </div>
    </div>
  );
}
