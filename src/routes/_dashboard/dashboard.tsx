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
} from "lucide-react";
import { PushNotificationManager } from "@/components/dashboard/PushNotificationManager";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

      const currentSales = currentSalesRes.data || [];
      const prevSales = prevSalesRes.data || [];
      const productsCount = productsRes.data?.length || 0;
      const funnel = funnelRes.data || { total_visitors: 0, product_views: 0, checkout_initiations: 0, total_purchases: 0 };
      const recentEvents = eventsRes.data || [];
      const alerts = alertsRes.data || [];

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
          // Intelligence Center specific metrics (simulated with available data)
          cpm: 12.5, // Total Cost per 1000 impressions (placeholder)
          cpc: 0.85, // Cost per click
          ctr: 4.2,  // Click through rate
          cpa: 15.0, // Cost per acquisition
          roas: 5.4, // Return on ad spend
          rpc: revenue / (funnel.total_visitors || 1), // Revenue per customer (visitor)
          rpv: revenue / (funnel.total_visitors || 1), // Revenue per visitor
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
        description: "Total aprovado"
      },
      {
        title: "Vendas",
        value: current.salesCount,
        icon: CreditCard,
        change: calculateChange(current.salesCount, previous.salesCount),
        positive: current.salesCount >= previous.salesCount,
        description: "Pedidos aprovados"
      },
      {
        title: "Taxa de Conversão",
        value: `${current.conversion.toFixed(1)}%`,
        icon: Percent,
        change: calculateChange(current.conversion, previous.conversion),
        positive: current.conversion >= previous.conversion,
        description: "Aprovadas vs Total"
      },
      {
        title: "Ticket Médio",
        value: `${current.ticketMedio.toLocaleString("pt-MZ")} MT`,
        icon: Receipt,
        change: calculateChange(current.ticketMedio, previous.ticketMedio),
        positive: current.ticketMedio >= previous.ticketMedio,
        description: "Média por venda"
      },
      {
        title: "Lucro Estimado",
        value: `${current.lucroEstimado.toLocaleString("pt-MZ")} MT`,
        icon: TrendingUp,
        change: calculateChange(current.lucroEstimado, previous.lucroEstimado),
        positive: current.lucroEstimado >= previous.lucroEstimado,
        description: "Após taxas (est.)"
      },
      {
        title: "Reembolsos",
        value: current.refunds,
        icon: RotateCcw,
        change: calculateChange(current.refunds, previous.refunds),
        positive: current.refunds <= previous.refunds,
        description: "Vendas estornadas"
      },
      {
        title: "Clientes Únicos",
        value: current.uniqueCustomers,
        icon: Users,
        change: calculateChange(current.uniqueCustomers, previous.uniqueCustomers),
        positive: current.uniqueCustomers >= previous.uniqueCustomers,
        description: "Por telefone/ID"
      },
      {
        title: "Produtos Vendidos",
        value: current.productsSold,
        icon: Package,
        change: calculateChange(current.productsSold, previous.productsSold),
        positive: current.productsSold >= previous.productsSold,
        description: "Volume total"
      },
      {
        title: "Total M-Pesa",
        value: `${current.mpesaRevenue.toLocaleString("pt-MZ")} MT`,
        icon: Smartphone,
        change: calculateChange(current.mpesaRevenue, previous.mpesaRevenue),
        positive: current.mpesaRevenue >= previous.mpesaRevenue,
        description: "Processado"
      },
      {
        title: "Total e-Mola",
        value: `${current.emolaRevenue.toLocaleString("pt-MZ")} MT`,
        icon: Smartphone,
        change: calculateChange(current.emolaRevenue, previous.emolaRevenue),
        positive: current.emolaRevenue >= previous.emolaRevenue,
        description: "Processado"
      }
    ];
  }, [dashboardData]);

  const paymentData = useMemo(() => {
    if (!dashboardData) return [];
    return [
      { name: "M-Pesa", value: dashboardData.current.mpesaRevenue, color: "#2563eb" },
      { name: "e-Mola", value: dashboardData.current.emolaRevenue, color: "#ef4444" },
    ].filter(d => d.value > 0);
  }, [dashboardData]);

  const handleRangeChange = (range: { from: Date; to: Date }, newPreset: DateRangePreset) => {
    setDateRange(range);
    setPreset(newPreset);
    sessionStorage.setItem("dashboard-date-range", JSON.stringify(range));
    sessionStorage.setItem("dashboard-preset", newPreset);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 font-bold px-3">PRO VERSION</Badge>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Ready</span>
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

      <Tabs defaultValue="overview" className="space-y-8">
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
              {isLoading ? (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {[...Array(8)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardHeader className="h-20" />
                      <CardContent className="h-16" />
                    </Card>
                  ))}
                </div>
              ) : (
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
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">vs anterior</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-1 space-y-6">
               <PushNotificationManager />
               
               {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
                 <Card className="border-none shadow-md bg-black text-white overflow-hidden">
                   <CardHeader className="pb-3 border-b border-white/10">
                     <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Bell className="h-4 w-4 text-primary" /> Alertas de Marketing
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="p-0">
                     {dashboardData.alerts.map((alert: any) => (
                       <div key={alert.id} className="p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer group">
                         <div className="flex items-start gap-3">
                            <div className={cn(
                              "mt-1.5 h-2 w-2 rounded-full shrink-0",
                              alert.type === 'danger' ? 'bg-red-500' : 'bg-yellow-500'
                            )} />
                            <div className="space-y-1">
                               <p className="text-xs font-bold leading-none group-hover:text-primary transition-colors">{alert.title}</p>
                               <p className="text-[10px] text-slate-400 line-clamp-2">{alert.message}</p>
                            </div>
                         </div>
                       </div>
                     ))}
                   </CardContent>
                 </Card>
               )}
            </div>
          </div>

      {isLoading ? null : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {stats.slice(8).map((stat) => (
              <Card key={stat.title} className="group hover:shadow-md transition-all duration-300 border-none bg-white dark:bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{stat.title}</CardTitle>
                  <stat.icon className="h-3.5 w-3.5 text-primary/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold truncate tracking-tight">{stat.value}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-[10px] font-bold flex items-center",
                      stat.positive ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {stat.positive ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                      {stat.change}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm border-none bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Gráfico de Faturamento</CardTitle>
                <CardDescription>Comparação de receita com o período anterior.</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                {dashboardData?.current.totalCount === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground italic">
                    Nenhum dado encontrado para este período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboardData?.chartData}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={(val) => val >= 1000 ? `${val/1000}k` : val} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [value.toLocaleString("pt-MZ") + " MT", ""]}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle"/>
                      <Area 
                        name="Período Atual"
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#2563eb" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorRev)" 
                      />
                      <Area 
                        name="Período Anterior"
                        type="monotone" 
                        dataKey="prevRevenue" 
                        stroke="#94a3b8" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        fill="transparent" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Gráfico de Vendas</CardTitle>
                <CardDescription>Volume de pedidos aprovados por dia.</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                {dashboardData?.current.totalCount === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground italic">
                    Nenhum dado encontrado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardData?.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                      <Tooltip 
                        cursor={{fill: 'rgba(0,0,0,0.05)'}}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle"/>
                      <Bar name="Vendas Atuais" dataKey="sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar name="Vendas Anteriores" dataKey="prevSales" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Métodos de Pagamento</CardTitle>
                <CardDescription>Distribuição de receita por canal.</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px] flex flex-col items-center justify-center">
                {paymentData.length === 0 ? (
                  <div className="text-muted-foreground italic">Sem dados de pagamento.</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="80%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {paymentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => [value.toLocaleString("pt-MZ") + " MT", ""]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-4 mt-4">
                      {paymentData.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-semibold">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({((item.value / (dashboardData?.current.revenue || 1)) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Evolução da Conversão</CardTitle>
                <CardDescription>Taxa de aprovação diária no período.</CardDescription>
              </CardHeader>
              <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboardData?.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={(val) => `${val}%`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`${value}%`, "Conversão"]}
                    />
                    <Line type="monotone" dataKey="conversion" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
