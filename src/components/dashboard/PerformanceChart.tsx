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

interface ChartDatum {
  name: string;
  sucesso: number;
  falha: number;
}

export default function PerformanceChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: 900, fill: "#94a3b8" }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "20px",
              border: "none",
              boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
              padding: "15px",
            }}
            itemStyle={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{
              fontSize: "10px",
              fontWeight: 900,
              textTransform: "uppercase",
              paddingBottom: "30px",
            }}
          />
          <Bar dataKey="sucesso" fill="#10b981" radius={[6, 6, 0, 0]} name="PAGO" barSize={20} />
          <Bar dataKey="falha" fill="#f43f5e" radius={[6, 6, 0, 0]} name="FALHA" barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
