import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Globe, 
  Plus, 
  Copy, 
  Check, 
  BarChart, 
  Users, 
  MousePointer2, 
  ShoppingCart,
  Trash2,
  ExternalLink,
  Code,
  Layout,
  HelpCircle,
  Clock,
  ArrowRight
} from "lucide-react";
...
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function TrafficAnalysis() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newPage, setNewPage] = useState({ name: "", url: "", type: "normal" });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: pages, isLoading: isLoadingPages } = useQuery({
    queryKey: ["traffic-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traffic_pages")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: events, isLoading: isLoadingEvents } = useQuery({
    queryKey: ["traffic-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traffic_events")
        .select("*")
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data;
    }
  });

  const createPageMutation = useMutation({
    mutationFn: async (page: { name: string; url: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { data, error } = await supabase
        .from("traffic_pages")
        .insert([{ ...page, user_id: user.id }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traffic-pages"] });
      setIsAddDialogOpen(false);
      setNewPage({ name: "", url: "" });
      toast.success("Página de vendas cadastrada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar página: " + error.message);
    }
  });

  const deletePageMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("traffic_pages")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traffic-pages"] });
      toast.success("Página removida com sucesso!");
    }
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Código copiado para a área de transferência!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getTrackingScript = (trackingId: string) => {
    const origin = window.location.origin;
    return `<!-- Início do Código de Tracking CheckoutPro -->
<script>
(function(w,d,s,l,i){
  w[l]=w[l]||[];
  var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
  j.async=true;j.src='${origin}/tracking.js?id='+i+dl;
  f.parentNode.insertBefore(j,f);
})(window,document,'script','trackData','${trackingId}');
</script>
<!-- Fim do Código de Tracking CheckoutPro -->`;
  };

  const getPageMetrics = (pageId: string) => {
    if (!events) return { visits: 0, clicks: 0, purchases: 0, conversionRate: 0 };
    
    const pageEvents = events.filter(e => e.page_id === pageId);
    const visits = pageEvents.filter(e => e.event_type === "visit").length;
    const clicks = pageEvents.filter(e => e.event_type === "click").length;
    const purchases = pageEvents.filter(e => e.event_type === "purchase").length;
    
    const conversionRate = visits > 0 ? (purchases / visits) * 100 : 0;
    
    return { visits, clicks, purchases, conversionRate };
  };

  if (isLoadingPages) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Análise de Tráfego</h1>
          <p className="text-sm md:text-base text-muted-foreground">Monitore o desempenho das suas páginas de vendas e funil de conversão.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Página
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Página de Vendas</DialogTitle>
              <DialogDescription>
                Cadastre a URL da sua página de vendas para começar a rastrear métricas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Página</Label>
                <Input 
                  id="name" 
                  placeholder="Ex: Landing Page - Produto X" 
                  value={newPage.name}
                  onChange={(e) => setNewPage({ ...newPage, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">URL da Página</Label>
                <Input 
                  id="url" 
                  placeholder="https://suapagina.com" 
                  value={newPage.url}
                  onChange={(e) => setNewPage({ ...newPage, url: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
              <Button 
                onClick={() => createPageMutation.mutate(newPage)}
                disabled={!newPage.name || !newPage.url || createPageMutation.isPending}
              >
                {createPageMutation.isPending ? "Salvando..." : "Salvar Página"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {pages?.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <Globe className="h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma página cadastrada</h3>
            <p className="text-muted-foreground max-w-sm mt-2">
              Comece cadastrando sua primeira página de vendas para acompanhar as visitas e conversões.
            </p>
            <Button className="mt-6 gap-2" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Adicionar Página
            </Button>
          </Card>
        ) : (
          pages?.map((page) => {
            const metrics = getPageMetrics(page.id);
            return (
              <Card key={page.id} className="overflow-hidden border-none shadow-sm bg-white dark:bg-slate-900">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      {page.name}
                      <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-primary transition-colors">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">{page.url}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Code className="h-4 w-4" />
                          Script
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Código de Tracking</DialogTitle>
                          <DialogDescription>
                            Copie e cole este código na seção <code className="bg-slate-100 px-1 rounded">&lt;head&gt;</code> ou no final do <code className="bg-slate-100 px-1 rounded">&lt;body&gt;</code> da sua página de vendas.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="relative mt-4">
                          <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs leading-relaxed">
                            {getTrackingScript(page.tracking_id)}
                          </pre>
                          <Button 
                            size="sm" 
                            className="absolute top-2 right-2 gap-2"
                            onClick={() => copyToClipboard(getTrackingScript(page.tracking_id), page.id)}
                          >
                            {copiedId === page.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copiedId === page.id ? "Copiado" : "Copiar"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja remover esta página e todos os seus dados de tráfego?")) {
                          deletePageMutation.mutate(page.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 md:grid-cols-4 mb-8">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                        <Users className="h-3.5 w-3.5" />
                        Visitas
                      </div>
                      <div className="text-2xl font-bold">{metrics.visits}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                        <MousePointer2 className="h-3.5 w-3.5" />
                        Cliques
                      </div>
                      <div className="text-2xl font-bold">{metrics.clicks}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Vendas
                      </div>
                      <div className="text-2xl font-bold">{metrics.purchases}</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                        <BarChart className="h-3.5 w-3.5" />
                        Conversão
                      </div>
                      <div className="text-2xl font-bold">{metrics.conversionRate.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Funnel Visual */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-tight">Funil de Conversão</h4>
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="flex justify-between text-sm mb-1.5 px-1">
                          <span className="font-medium">Visitas</span>
                          <span className="text-slate-500">{metrics.visits} (100%)</span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: "100%" }}></div>
                        </div>
                      </div>
                      
                      <div className="relative">
                        <div className="flex justify-between text-sm mb-1.5 px-1">
                          <span className="font-medium">Cliques (Checkout)</span>
                          <span className="text-slate-500">
                            {metrics.clicks} ({metrics.visits > 0 ? ((metrics.clicks / metrics.visits) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary/60 rounded-full" 
                            style={{ width: `${metrics.visits > 0 ? (metrics.clicks / metrics.visits) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="flex justify-between text-sm mb-1.5 px-1">
                          <span className="font-medium">Vendas Realizadas</span>
                          <span className="text-slate-500">
                            {metrics.purchases} ({metrics.conversionRate.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary/30 rounded-full" 
                            style={{ width: `${metrics.conversionRate}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}