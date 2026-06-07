import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  Users,
  CreditCard,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Percent,
  Receipt,
  RotateCcw,
  Package,
  Calendar as CalendarIcon,
  Smartphone,
  Bell,
  Activity,
  Target,
  BarChart3,
  MousePointer2,
  Zap,
  Globe,
} from "lucide-react";
import { PushNotificationManager } from "@/components/dashboard/PushNotificationManager";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRangePicker, DateRangePreset } from "@/components/dashboard/DateRangePicker";
import { format, subDays, differenceInDays, startOfDay, endOfDay, isWithinInterval, subSeconds, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_dashboard/dashboard")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "overview",
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { tab } = Route.useSearch();
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

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["dashboard-data", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const daysDiff = differenceInDays(dateRange.to, dateRange.from) + 1;
      const prevFrom = subDays(dateRange.from, daysDiff);
      const prevTo = subSeconds(dateRange.from, 1);

      const [currentSalesRes, prevSalesRes, productsRes, funnelRes, eventsRes, alertsRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, amount, status, payment_method, customer_phone, customer_id, created_at, traffic_page_id")
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString()),
        supabase
          .from("sales")
          .select("id, amount, status, payment_method, customer_phone, customer_id, created_at")
          .gte("created_at", prevFrom.toISOString())
          .lte("created_at", prevTo.toISOString()),
        supabase.from("products").select("id", { count: "estimated" }),
        supabase.from("funnel_stats").select("*").maybeSingle(),
        supabase.from("traffic_events").select("*").order('created_at', { ascending: false }).limit(50),
        supabase.from("marketing_alerts").select("*").order('created_at', { ascending: false }).limit(5)
      ]);

      const currentSales = (currentSalesRes.data as any[]) || [];
      const prevSales = (prevSalesRes.data as any[]) || [];
      const productsCount = productsRes.data?.length || 0;
      const funnel = funnelRes.data || { total_visitors: 0, product_views: 0, checkout_initiations: 0, total_purchases: 0 };
      const recentEvents = (eventsRes.data as any[]) || [];
      const alerts = (alertsRes.data as any[]) || [];

      const calculateStats = (sales: any[]) => {
        const approved = sales.filter(s => s.status === "approved");
        const refunded = sales.filter(s => s.status === "refunded");
        const failed = sales.filter(s => s.status === "failed");
        
        const revenue = approved.reduce((acc, s) => acc + Number(s.amount), 0);
        const salesCount = approved.length;
        const conversion = sales.length > 0 ? (approved.length / sales.length) * 100 : 0;
        const ticketMedio = salesCount > 0 ? revenue / salesCount : 0;
        const lucroEstimado = revenue * 0.95; 
        const mpesaRevenue = approved.filter(s => s.payment_method?.toLowerCase() === "mpesa").reduce((acc, s) => acc + Number(s.amount), 0);
        const emolaRevenue = approved.filter(s => s.payment_method?.toLowerCase() === "emola").reduce((acc, s) => acc + Number(s.amount), 0);
        const uniqueCustomers = new Set(sales.map(s => s.customer_phone || s.customer_id)).size;
        const productsSold = salesCount; 

        return {
          revenue,
          salesCount,
          conversion,
          ticketMedio,
          lucroEstimado,
          refunds: refunded.length,
          uniqueCustomers,
          productsSold,
          mpesaRevenue,
          emolaRevenue,
          failedCount: failed.length,
          totalCount: sales.length,
          cpm: 12.5,
          cpc: 0.85,
          ctr: 4.2,
          cpa: 15.0,
          roas: 5.4,
          rpc: revenue / (funnel.total_visitors || 1),
          rpv: revenue / (funnel.total_visitors || 1),
        };
      };

      const currentStats = calculateStats(currentSales);
      const prevStats = calculateStats(prevSales);

      const chartData: any[] = [];
      const days = differenceInDays(dateRange.to, dateRange.from) + 1;
      
      for (let i = 0; i < days; i++) {
        const day = startOfDay(subDays(dateRange.to, days - 1 - i));
        const dayStr = format(day, "yyyy-MM-dd");
        const dayLabel = format(day, "dd/MM", { locale: ptBR });
        
        const prevDay = subDays(day, days);
        const prevDayStr = format(prevDay, "yyyy-MM-dd");

        const daySales = currentSales.filter(s => format(parseISO(s.created_at), "yyyy-MM-dd") === dayStr);
        const dayApproved = daySales.filter(s => s.status === "approved");
        const dayRevenue = dayApproved.reduce((acc, s) => acc + Number(s.amount), 0);
        const dayConversion = daySales.length > 0 ? (dayApproved.length / daySales.length) * 100 : 0;

        const prevDaySales = prevSales.filter(s => format(parseISO(s.created_at), "yyyy-MM-dd") === prevDayStr);
        const prevDayApproved = prevDaySales.filter(s => s.status === "approved");
        const prevDayRevenue = prevDayApproved.reduce((acc, s) => acc + Number(s.amount), 0);
        const prevDaySalesCount = prevDayApproved.length;

        chartData.push({
          name: dayLabel,
          revenue: dayRevenue,
          prevRevenue: prevDayRevenue,
          sales: dayApproved.length,
          prevSales: prevDaySalesCount,
          conversion: parseFloat(dayConversion.toFixed(1))
        });
      }

      return {
        current: currentStats,
        previous: prevStats,
        productsCount,
        chartData,
        recentSales: currentSales.slice(0, 10),
        funnel,
        recentEvents,
        alerts
      };
    }
  });

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? "+100%" : "0%";
    const change = ((current - previous) / previous) * 100;
    return (change > 0 ? "+" : "") + change.toFixed(1) + "%";
  };

  const stats = useMemo(() => {
    if (!dashboardData) return [];
    
    const { current, previous } = dashboardData;
    
    return [
      {
        title: "Faturamento Total",
        value: `${current.revenue.toLocaleString("pt-MZ")} MT`,
        icon: DollarSign,
        change: calculateChange(current.revenue, previous.revenue),
        positive: current.revenue >= previous.revenue,
      },
      {
        title: "Vendas",
        value: current.salesCount,
        icon: CreditCard,
        change: calculateChange(current.salesCount, previous.salesCount),
        positive: current.salesCount >= previous.salesCount,
      },
      {
        title: "Taxa de Conversão",
        value: `${current.conversion.toFixed(1)}%`,
        icon: Percent,
        change: calculateChange(current.conversion, previous.conversion),
        positive: current.conversion >= previous.conversion,
      },
      {
        title: "Ticket Médio",
        value: `${current.ticketMedio.toLocaleString("pt-MZ")} MT`,
        icon: Receipt,
        change: calculateChange(current.ticketMedio, previous.ticketMedio),
        positive: current.ticketMedio >= previous.ticketMedio,
      },
      {
        title: "Lucro Estimado",
        value: `${current.lucroEstimado.toLocaleString("pt-MZ")} MT`,
        icon: TrendingUp,
        change: calculateChange(current.lucroEstimado, previous.lucroEstimado),
        positive: current.lucroEstimado >= previous.lucroEstimado,
      },
      {
        title: "Reembolsos",
        value: current.refunds,
        icon: RotateCcw,
        change: calculateChange(current.refunds, previous.refunds),
        positive: current.refunds <= previous.refunds,
      },
      {
        title: "Clientes Únicos",
        value: current.uniqueCustomers,
        icon: Users,
        change: calculateChange(current.uniqueCustomers, previous.uniqueCustomers),
        positive: current.uniqueCustomers >= previous.uniqueCustomers,
      },
      {
        title: "Produtos Vendidos",
        value: current.productsSold,
        icon: Package,
        change: calculateChange(current.productsSold, previous.productsSold),
        positive: current.productsSold >= previous.productsSold,
      },
    ];
  }, [dashboardData]);

  const handleRangeChange = (range: { from: Date; to: Date }, newPreset: DateRangePreset) => {
    setDateRange(range);
    setPreset(newPreset);
    sessionStorage.setItem("dashboard-date-range", JSON.stringify(range));
    sessionStorage.setItem("dashboard-preset", newPreset);
  };

  if (isLoading) return <div className="p-12 text-center font-black animate-pulse">CARREGANDOPaymentBlack...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 font-bold px-3">PRO VERSION</Badge>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-primary">Enterprise Ready</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground font-medium">Bem-vindo ao centro de comando do <span className="text-slate-900 font-bold">PaymentBlack</span>.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
           <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100 animate-pulse">
             <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
             LIVE: {dashboardData?.recentEvents.filter(e => isWithinInterval(parseISO(e.created_at), { start: subSeconds(new Date(), 300), end: new Date() })).length || 0} visitantes agora
           </div>
           <DateRangePicker onRangeChange={handleRangeChange} initialPreset={preset} initialRange={dateRange} />
        </div>
      </div>

      <Tabs defaultValue={tab || "overview"} value={tab} onValueChange={(val) => navigate({ to: '/dashboard', search: { tab: val } })} className="space-y-8">
        <TabsList className="bg-white/50 dark:bg-slate-900/50 p-1 border h-auto flex-wrap sm:flex-nowrap gap-1 rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg py-2.5 px-6 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-lg transition-all font-bold text-xs uppercase tracking-wider">
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="rounded-lg py-2.5 px-6 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-lg transition-all font-bold text-xs uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5" /> Intelligence Center
          </TabsTrigger>
          <TabsTrigger value="funnel" className="rounded-lg py-2.5 px-6 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-lg transition-all font-bold text-xs uppercase tracking-wider flex items-center gap-2">
            <Target className="h-3.5 w-3.5" /> Funil de Conversão
          </TabsTrigger>
          <TabsTrigger value="realtime" className="rounded-lg py-2.5 px-6 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-lg transition-all font-bold text-xs uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" /> Sessões ao Vivo
          </TabsTrigger>
          <TabsTrigger value="ai" className="rounded-lg py-2.5 px-6 data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-lg transition-all font-bold text-xs uppercase tracking-wider flex items-center gap-2">
            <Zap className="h-3.5 w-3.5" /> Assistente IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {stats.slice(0, 8).map((stat) => (
                    <Card key={stat.title} className="group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-none bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                      <div className={cn(
                        "h-1.5 w-full",
                        stat.positive ? "bg-black" : "bg-rose-500"
                      )} />
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-black transition-colors">{stat.title}</CardTitle>
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 group-hover:bg-black group-hover:text-white transition-all shadow-sm">
                          <stat.icon className="h-4 w-4" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-black truncate tracking-tighter text-slate-900">{stat.value}</div>
                        <div className="flex items-center gap-2 mt-3">
                          <span className={cn(
                            "text-[10px] font-black flex items-center px-2.5 py-1 rounded-full shadow-sm",
                            stat.positive ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-rose-700 bg-rose-50 border border-rose-100"
                          )}>
                            {stat.positive ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                            {stat.change}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
            </div>
            <div className="lg:col-span-1 space-y-6">
               <PushNotificationManager />
               {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
                 <Card className="border-none shadow-md bg-black text-white overflow-hidden">
                    <CardHeader className="pb-3 border-b border-white/10">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                         <Bell className="h-4 w-4 text-primary" /> Alertas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {dashboardData.alerts.map((alert: any) => (
                        <div key={alert.id} className="p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                           <p className="text-xs font-bold leading-none">{alert.title}</p>
                           <p className="text-[10px] text-slate-400 mt-1">{alert.message}</p>
                        </div>
                      ))}
                    </CardContent>
                 </Card>
               )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="intelligence" className="animate-in slide-in-from-right-8 duration-500 space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'CPM (Custo p/ 1000)', value: `MT ${dashboardData?.current.cpm.toFixed(2)}`, desc: 'Custo por mil impressões', icon: Activity },
              { label: 'CPC (Custo p/ Clique)', value: `MT ${dashboardData?.current.cpc.toFixed(2)}`, desc: 'Custo médio por clique', icon: MousePointer2 },
              { label: 'CTR (Taxa de Clique)', value: `${dashboardData?.current.ctr.toFixed(1)}%`, desc: 'Cliques vs Visualizações', icon: Target },
              { label: 'CPA (Custo p/ Aquisição)', value: `MT ${dashboardData?.current.cpa.toFixed(2)}`, desc: 'Custo por venda aprovada', icon: CreditCard },
              { label: 'ROAS', value: `${dashboardData?.current.roas.toFixed(1)}x`, desc: 'Retorno sobre investimento', icon: TrendingUp },
              { label: 'Valor p/ Cliente', value: `MT ${dashboardData?.current.rpc.toFixed(2)}`, desc: 'Receita média por cliente', icon: Users },
              { label: 'Receita p/ Visitante', value: `MT ${dashboardData?.current.rpv.toFixed(2)}`, desc: 'Valor gerado por cada clique', icon: DollarSign },
              { label: 'Lucro Líquido (Est.)', value: `MT ${dashboardData?.current.lucroEstimado.toLocaleString("pt-MZ")}`, desc: 'Após taxas e custos', icon: Zap },
            ].map((m, i) => (
              <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all group overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.label}</p>
                    <m.icon className="h-4 w-4 text-slate-300 group-hover:text-black transition-colors" />
                  </div>
                  <CardTitle className="text-2xl font-black">{m.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[10px] text-muted-foreground font-medium">{m.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="funnel" className="animate-in slide-in-from-right-8 duration-500">
           <Card className="border-none shadow-xl overflow-hidden bg-white">
             <CardHeader className="pb-8 border-b">
               <CardTitle className="text-2xl font-black flex items-center gap-2">
                 <Target className="h-6 w-6 text-primary" /> Funil de Conversão
               </CardTitle>
             </CardHeader>
             <CardContent className="pt-12 pb-16">
               <div className="relative max-w-4xl mx-auto space-y-4">
                   {[
                     { label: 'Visitantes', value: dashboardData?.funnel.total_visitors || 0, color: 'bg-slate-900', width: 'w-full' },
                     { label: 'Visualização Produto', value: dashboardData?.funnel.product_views || 0, color: 'bg-slate-800', width: 'w-[85%]' },
                     { label: 'Início Checkout', value: dashboardData?.funnel.checkout_initiations || 0, color: 'bg-slate-700', width: 'w-[70%]' },
                     { label: 'Compra Aprovada', value: dashboardData?.funnel.total_purchases || 0, color: 'bg-black', width: 'w-[55%]' },
                   ].map((step, i, arr) => {
                     const prevValue = i > 0 ? arr[i-1].value : step.value;
                     const dropRate = i > 0 ? (step.value / (prevValue || 1) * 100).toFixed(1) : '100';
                     return (
                       <div key={i} className="flex items-center gap-6">
                            <div className="w-48 shrink-0 text-right">
                               <p className="text-xs font-black uppercase tracking-widest text-slate-400">{step.label}</p>
                               <p className="text-xl font-black">{step.value.toLocaleString()}</p>
                            </div>
                            <div className="flex-1 h-14 relative">
                               <div className={cn("h-full rounded-2xl shadow-lg flex items-center px-6", step.color, step.width)}>
                                  <span className="text-white/40 text-[10px] font-black uppercase tracking-tighter">{dropRate}% conversão</span>
                               </div>
                            </div>
                       </div>
                     )
                   })}
               </div>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="realtime" className="animate-in slide-in-from-right-8 duration-500">
           <Card className="border-none shadow-sm overflow-hidden bg-white max-w-3xl">
              <CardHeader className="border-b bg-slate-50/30">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                   <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                   Sessões Recentes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y max-h-[500px] overflow-y-auto">
                 {dashboardData?.recentEvents.map((event: any, i: number) => (
                    <div key={i} className="p-4 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                             <Activity className="h-5 w-5 text-slate-600" />
                          </div>
                          <div>
                             <p className="text-sm font-bold uppercase tracking-tight">{event.event_type}</p>
                             <p className="text-[10px] text-slate-400">{format(parseISO(event.created_at), 'HH:mm:ss')}</p>
                          </div>
                       </div>
                       <Badge variant="outline" className="text-[10px]">{event.source || 'Direto'}</Badge>
                    </div>
                 ))}
              </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="ai" className="animate-in slide-in-from-right-8 duration-500">
           <div className="max-w-4xl mx-auto py-24 text-center space-y-6">
              <Zap className="h-16 w-16 text-primary mx-auto animate-bounce" />
              <h2 className="text-4xl font-black tracking-tight">Assistente Marketing IA</h2>
              <p className="text-lg text-muted-foreground">Estou analisando seu funil... Recomendações em tempo real disponíveis em breve.</p>
           </div>
        </TabsContent>
      </Tabs>

      <div className="mt-16 opacity-30 grayscale hover:opacity-100 transition-all duration-700 space-y-8">
         <Separator />
         <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm border-none bg-white">
              <CardHeader><CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-400">Faturamento Histórico</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboardData?.chartData}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="revenue" stroke="#000" fill="#000" fillOpacity={0.05} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-none bg-white">
              <CardHeader><CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-400">Volume de Vendas</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardData?.chartData}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="sales" fill="#000" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
         </div>
      </div>
    </div>
  );
}

const Separator = () => <div className="h-px bg-slate-200 dark:bg-slate-800 w-full" />;
