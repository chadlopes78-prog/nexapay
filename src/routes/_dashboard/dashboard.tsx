import { useState, useMemo, lazy, Suspense } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { DateRangePicker, DateRangePreset } from "@/components/dashboard/DateRangePicker";
import { format, subDays, differenceInDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

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

  const queryClient = useQueryClient();

  useEffect(() => {
    // Listen for realtime sale updates to refresh dashboard immediately
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
          queryClient.invalidateQueries({ queryKey: ["dashboard-simple-metrics"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["dashboard-simple-metrics", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: currentSalesRes } = await supabase
        .from("sales")
        .select("amount, status, created_at")
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());

      const currentSales = (currentSalesRes as any[]) || [];
      
      const calculateStats = (sales: any[]) => {
        const approved = sales.filter(s => ["approved", "paid", "success"].includes(s.status?.toLowerCase()));
        const failed = sales.filter(s => ["failed", "error", "cancelled", "canceled"].includes(s.status?.toLowerCase()));
        
        const totalTransactions = sales.length;
        const successCount = approved.length;
        const failedCount = failed.length;
        
        const totalValue = sales.reduce((acc, s) => acc + Number(s.amount), 0);
        const receivedValue = approved.reduce((acc, s) => acc + Number(s.amount), 0);
        const lostValue = failed.reduce((acc, s) => acc + Number(s.amount), 0);

        return {
          totalTransactions,
          successCount,
          failedCount,
          totalValue,
          receivedValue,
          lostValue,
        };
      };

      const stats = calculateStats(currentSales);

      const chartData: any[] = [];
      const days = differenceInDays(dateRange.to, dateRange.from) + 1;
      
      for (let i = 0; i < days; i++) {
        const day = startOfDay(subDays(dateRange.to, days - 1 - i));
        const dayStr = format(day, "yyyy-MM-dd");
        const dayLabel = format(day, "dd/MM", { locale: ptBR });
        
        const daySales = currentSales.filter(s => format(parseISO(s.created_at), "yyyy-MM-dd") === dayStr);
        const daySuccess = daySales.filter(s => ["approved", "paid", "success"].includes(s.status?.toLowerCase())).length;
        const dayFailed = daySales.filter(s => ["failed", "error", "cancelled", "canceled"].includes(s.status?.toLowerCase())).length;

        chartData.push({
          name: dayLabel,
          sucesso: daySuccess,
          falha: dayFailed,
        });
      }

      return {
        stats,
        chartData
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
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
        value: stats.totalTransactions,
        description: "Volume total de pedidos",
        icon: ShoppingCart,
        color: "bg-slate-900",
      },
      {
        title: "Vendas com Sucesso",
        value: stats.successCount,
        description: "Pagamentos confirmados",
        icon: TrendingUp,
        color: "bg-emerald-500",
      },
      {
        title: "Vendas com Falha",
        value: stats.failedCount,
        description: "Pagamentos não concluídos",
        icon: TrendingDown,
        color: "bg-rose-500",
      },
      {
        title: "Valor Total",
        value: `${stats.totalValue.toLocaleString("pt-MZ")} MT`,
        description: "Soma de todas as tentativas",
        icon: DollarSign,
        color: "bg-blue-600",
      },
      {
        title: "Valor Recebido",
        value: `${stats.receivedValue.toLocaleString("pt-MZ")} MT`,
        description: "Dinheiro real em caixa",
        icon: CreditCard,
        color: "bg-emerald-600",
      },
      {
        title: "Valor Perdido",
        value: `${stats.lostValue.toLocaleString("pt-MZ")} MT`,
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
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-muted-foreground font-medium">Resumo profissional de performance de vendas.</p>
        </div>
        <DateRangePicker onRangeChange={handleRangeChange} initialPreset={preset} initialRange={dateRange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((metric) => (
          <Card key={metric.title} className="border-none shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
            <div className={cn("h-1 w-full", metric.color)} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{metric.title}</span>
              <metric.icon className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-900 tracking-tight">{metric.value}</div>
              <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">{metric.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-none shadow-sm bg-white p-4 md:p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Performance ao Longo do Tempo
            </CardTitle>
            <CardDescription className="text-xs font-bold uppercase">Transações de Sucesso vs Falha</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData?.chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', paddingBottom: '20px' }}
                  />
                  <Bar dataKey="sucesso" fill="#10b981" radius={[4, 4, 0, 0]} name="SUCESSO" />
                  <Bar dataKey="falha" fill="#f43f5e" radius={[4, 4, 0, 0]} name="FALHA" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<div className="h-32 bg-slate-100 animate-pulse rounded-2xl" />}>
          <PushNotificationManager />
        </Suspense>
        
        <Card className="border-none shadow-sm bg-black text-white p-6 rounded-2xl flex flex-col justify-center">
          <h3 className="text-lg font-black uppercase tracking-wider mb-2">Dica de Performance</h3>
          <p className="text-sm text-slate-400 font-medium">
            Foque em reduzir as vendas com falha para aumentar seu faturamento sem precisar de novos visitantes.
          </p>
        </Card>
      </div>
    </div>
  );
}


const Separator = () => <div className="h-px bg-slate-200 dark:bg-slate-800 w-full" />;
