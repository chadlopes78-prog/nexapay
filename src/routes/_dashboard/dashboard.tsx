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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
} from "recharts";

export const Route = createFileRoute("/_dashboard/dashboard" as any)({
  component: DashboardPage,
});

const data = [
  { name: "Seg", sales: 4000, revenue: 2400 },
  { name: "Ter", sales: 3000, revenue: 1398 },
  { name: "Qua", sales: 2000, revenue: 9800 },
  { name: "Qui", sales: 2780, revenue: 3908 },
  { name: "Sex", sales: 1890, revenue: 4800 },
  { name: "Sab", sales: 2390, revenue: 3800 },
  { name: "Dom", sales: 3490, revenue: 4300 },
];

const paymentData = [
  { name: "M-Pesa", value: 65, color: "#2563eb" },
  { name: "e-Mola", value: 35, color: "#ef4444" },
];

function DashboardPage() {
  const stats = [
    {
      title: "Vendas Realizadas",
      value: "1,284",
      change: "+12.5%",
      icon: CreditCard,
      positive: true,
    },
    {
      title: "Vendas Perdidas",
      value: "156",
      change: "+2.1%",
      icon: TrendingDown,
      positive: false,
    },
    {
      title: "Receita Hoje",
      value: "24,500 MT",
      change: "+18.2%",
      icon: DollarSign,
      positive: true,
    },
    { title: "Taxa de Conversão", value: "4.2%", change: "+0.8%", icon: Percent, positive: true },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo ao seu resumo de vendas.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p
                className={cn(
                  "text-xs flex items-center mt-1",
                  stat.positive ? "text-green-600" : "text-red-600",
                )}
              >
                {stat.positive ? (
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 mr-1" />
                )}
                {stat.change} desde ontem
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Sales Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Visão Geral de Receita</CardTitle>
            <CardDescription>Receita gerada nos últimos 7 dias.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Métodos de Pagamento</CardTitle>
            <CardDescription>Distribuição entre M-Pesa e e-Mola.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-4 text-sm">
              {paymentData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span>
                    {entry.name} ({entry.value}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Simple CN helper for dashboard page
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
