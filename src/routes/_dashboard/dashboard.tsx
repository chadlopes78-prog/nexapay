import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
      const { from, to } = JSON.parse(saved);
      return { from: new Date(from), to: new Date(to) };
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

      // Fetch sales for current and previous period
      // We fetch all sales of the user's products
      // RLS should handle the user_id filtering for us if configured, 
      // but we need to ensure we get the right dates.
      
      const [currentSalesRes, prevSalesRes, productsRes] = await Promise.all([
        supabase
          .from("sales")
          .select("*")
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString()),
        supabase
          .from("sales")
          .select("*")
          .gte("created_at", prevFrom.toISOString())
          .lte("created_at", prevTo.toISOString()),
        supabase.from("products").select("id")
      ]);

      const currentSales = currentSalesRes.data || [];
      const prevSales = prevSalesRes.data || [];
      const productsCount = productsRes.data?.length || 0;

      const calculateStats = (sales: any[]) => {
        const approved = sales.filter(s => s.status === "approved");
        const refunded = sales.filter(s => s.status === "refunded");
        const failed = sales.filter(s => s.status === "failed");
        
        const revenue = approved.reduce((acc, s) => acc + Number(s.amount), 0);
        const salesCount = approved.length;
        const conversion = sales.length > 0 ? (approved.length / sales.length) * 100 : 0;
        const ticketMedio = salesCount > 0 ? revenue / salesCount : 0;
        const lucroEstimado = revenue * 0.95; // 5% fee simulation
        const mpesaRevenue = approved.filter(s => s.payment_method?.toLowerCase() === "mpesa").reduce((acc, s) => acc + Number(s.amount), 0);
        const emolaRevenue = approved.filter(s => s.payment_method?.toLowerCase() === "emola").reduce((acc, s) => acc + Number(s.amount), 0);
        const uniqueCustomers = new Set(sales.map(s => s.customer_phone || s.customer_id)).size;
        const productsSold = salesCount; // Assuming 1 product per sale for now

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
          totalCount: sales.length
        };
      };

      const currentStats = calculateStats(currentSales);
      const prevStats = calculateStats(prevSales);

      // Prepare chart data (daily)
      const chartData: any[] = [];
      const days = differenceInDays(dateRange.to, dateRange.from) + 1;
      
      for (let i = 0; i < days; i++) {
        const day = startOfDay(subDays(dateRange.to, days - 1 - i));
        const dayStr = format(day, "yyyy-MM-dd");
        const dayLabel = format(day, "dd/MM", { locale: ptBR });
        
        // Previous period day
        const prevDay = subDays(day, days);
        const prevDayStr = format(prevDay, "yyyy-MM-dd");

        const daySales = currentSales.filter(s => format(parseISO(s.created_at), "yyyy-MM-dd") === dayStr);
        const dayApproved = daySales.filter(s => s.status === "approved");
        const dayRevenue = dayApproved.reduce((acc, s) => acc + Number(s.amount), 0);
        const dayConversion = daySales.length > 0 ? (dayApproved.length / daySales.length) * 100 : 0;

        const prevDaySales = prevSales.filter(s => format(parseISO(s.created_at), "yyyy-MM-dd") === prevDayStr);
        const prevDayApproved = prevDaySales.filter(s => s.status === "approved");
        const prevDayRevenue = prevDayApproved.reduce((acc, s) => acc + Number(s.amount), 0);

        chartData.push({
          name: dayLabel,
          revenue: dayRevenue,
          prevRevenue: prevDayRevenue,
          sales: dayApproved.length,
          prevSales: prevDayApproved.length,
          conversion: parseFloat(dayConversion.toFixed(1))
        });
      }

      return {
        current: currentStats,
        previous: prevStats,
        productsCount,
        chartData,
        recentSales: currentSales.slice(0, 10)
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">Analise o desempenho do seu negócio.</p>
        </div>
        <DateRangePicker onRangeChange={handleRangeChange} initialPreset={preset} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-20" />
              <CardContent className="h-16" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((stat) => (
              <Card key={stat.title} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-xs font-medium flex items-center",
                      stat.positive ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {stat.positive ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                      {stat.change}
                    </span>
                    <span className="text-xs text-muted-foreground italic">vs per. anterior</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4 shadow-sm border-none bg-slate-50/50 dark:bg-slate-900/50">
              <CardHeader>
                <CardTitle>Faturamento e Vendas</CardTitle>
                <CardDescription>Evolução diária no período selecionado.</CardDescription>
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
                      <XAxis 
                        dataKey="name" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748B', fontSize: 12 }}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748B', fontSize: 12 }}
                        tickFormatter={(value) => `${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [value.toLocaleString("pt-MZ") + " MT", "Faturamento"]}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#2563eb" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorRev)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3 shadow-sm border-none bg-slate-50/50 dark:bg-slate-900/50">
              <CardHeader>
                <CardTitle>Métodos de Pagamento</CardTitle>
                <CardDescription>Volume processado por canal.</CardDescription>
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
                        <Tooltip formatter={(value: any) => [value.toLocaleString("pt-MZ") + " MT", "Valor"]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 mt-4">
                      {paymentData.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-sm text-muted-foreground">
                            ({((item.value / (dashboardData?.current.revenue || 1)) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-7 shadow-sm border-none bg-slate-50/50 dark:bg-slate-900/50">
              <CardHeader>
                <CardTitle>Evolução da Conversão</CardTitle>
                <CardDescription>Percentual de aprovação ao longo do tempo.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboardData?.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`${value}%`, "Taxa de Conversão"]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="conversion" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
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
