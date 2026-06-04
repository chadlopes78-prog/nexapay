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
} from "recharts";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const [salesRes, productsRes] = await Promise.all([
        supabase.from("sales").select("*"),
        supabase.from("products").select("*")
      ]);

      const sales = salesRes.data || [];
      const products = productsRes.data || [];
      
      const revenue = sales
        .filter(s => s.status === "approved")
        .reduce((acc, s) => acc + Number(s.amount), 0);
      
      const approvedSales = sales.filter(s => s.status === "approved").length;
      const failedSales = sales.filter(s => s.status === "failed").length;
      const conversion = sales.length > 0 ? (approvedSales / sales.length) * 100 : 0;

      return {
        revenue,
        salesCount: approvedSales,
        failedCount: failedSales,
        productsCount: products.length,
        conversion: conversion.toFixed(1) + "%",
        recentSales: sales.slice(0, 7)
      };
    }
  });

  const statCards = [
    {
      title: "Vendas Realizadas",
      value: stats?.salesCount || 0,
      icon: CreditCard,
      positive: true,
      change: "0%"
    },
    {
      title: "Vendas Perdidas",
      value: stats?.failedCount || 0,
      icon: TrendingDown,
      positive: false,
      change: "0%"
    },
    {
      title: "Receita Total",
      value: `${(stats?.revenue || 0).toLocaleString("pt-MZ")} MT`,
      icon: DollarSign,
      positive: true,
      change: "0%"
    },
    { 
      title: "Produtos", 
      value: stats?.productsCount || 0, 
      icon: ShoppingCart, 
      positive: true,
      change: "0%"
    },
  ];

  const paymentData = [
    { name: "M-Pesa", value: 0, color: "#2563eb" },
    { name: "e-Mola", value: 0, color: "#ef4444" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo ao seu resumo de vendas.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={cn("text-xs flex items-center mt-1", stat.positive ? "text-green-600" : "text-red-600")}>
                {stat.positive ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {stat.change} desde ontem
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Visão Geral de Receita</CardTitle>
            <CardDescription>Receita gerada nos últimos 7 dias.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {stats?.salesCount === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground italic">
                Sem dados de vendas para exibir o gráfico.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#2563eb1a" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Métodos de Pagamento</CardTitle>
            <CardDescription>Distribuição entre M-Pesa e e-Mola.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center justify-center">
            {stats?.salesCount === 0 ? (
              <div className="text-muted-foreground italic">Sem vendas registradas.</div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

