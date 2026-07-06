import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { memo } from "react";

interface ChartDatum {
  name: string;
  sucesso: number;
  falha: number;
}

function PerformanceChartImpl({ data }: { data: ChartDatum[] }) {
  const hasData = data.some((d) => d.sucesso > 0 || d.falha > 0);

  return (
    <div className="h-[320px] w-full relative">
      {!hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <p className="text-xs text-slate-400">Sem dados no período selecionado</p>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="area-sucesso" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="area-falha" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
          />
          <Tooltip
            cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.12)",
              padding: "8px 12px",
              fontSize: "12px",
            }}
            labelStyle={{ fontWeight: 600, color: "#0f172a", marginBottom: 4 }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px", paddingBottom: "12px", color: "#475569" }}
          />
          <Area
            type="monotone"
            dataKey="sucesso"
            stroke="#22c55e"
            strokeWidth={2.5}
            fill="url(#area-sucesso)"
            name="Aprovadas"
            isAnimationActive={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
          />
          <Area
            type="monotone"
            dataKey="falha"
            stroke="#f43f5e"
            strokeWidth={2.5}
            fill="url(#area-falha)"
            name="Recusadas"
            isAnimationActive={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(PerformanceChartImpl);
