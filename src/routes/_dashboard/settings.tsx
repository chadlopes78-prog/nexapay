import { createFileRoute } from "@tanstack/react-router";
import { Settings, Shield, Globe, Bell, User, History, MessageSquare, PieChart, Smartphone, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PushNotificationManager } from "@/components/dashboard/PushNotificationManager";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return { ...data, email: user.email };
    }
  });

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: name,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Perfil atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar perfil: " + error.message);
    }
  });

  if (isLoading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferências da plataforma.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle>Dados do Perfil</CardTitle>
            </div>
            <CardDescription>Atualize suas informações pessoais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full-name">Nome Completo</Label>
                <Input 
                  id="full-name" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={profile?.email || ""} disabled />
              </div>
            </div>
            <Button 
              onClick={() => updateProfile.mutate(fullName)}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Segurança</CardTitle>
            </div>
            <CardDescription>Gerencie sua senha e autenticação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input id="new-password" type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input id="confirm-password" type="password" placeholder="••••••••" />
              </div>
            </div>
            <Button variant="outline" className="gap-2">
              <Lock className="h-4 w-4" />
              Alterar Senha
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle>Instalar App (PWA)</CardTitle>
            </div>
            <CardDescription>Use o PaymentBlack como um aplicativo nativo no seu iPhone ou Android.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-sm">
                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">No iPhone (iOS):</p>
                  <p className="text-muted-foreground">Abra no Safari, clique no ícone de <span className="font-bold">Compartilhar</span> e selecione <span className="font-bold">"Adicionar à Tela de Início"</span>.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-sm">
                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">No Android:</p>
                  <p className="text-muted-foreground">Clique nos três pontos do navegador e selecione <span className="font-bold">"Instalar Aplicativo"</span>.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Notificações PaymentBlack</CardTitle>
            </div>
            <CardDescription>Configure como e quando você deseja ser notificado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <PushNotificationManager />
            
            <Separator />
            
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Histórico Recente</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30 text-sm">
                  <PieChart className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold">Relatório Diário Disponível</p>
                    <p className="text-xs text-muted-foreground">Seu resumo de vendas de ontem está pronto.</p>
                    <p className="text-[10px] text-slate-400 mt-1">Há 14 horas</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30 text-sm">
                  <MessageSquare className="h-4 w-4 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-semibold">Inspiração Matinal</p>
                    <p className="text-xs text-muted-foreground">"O sucesso é a soma de pequenos esforços repetidos dia após dia."</p>
                    <p className="text-[10px] text-slate-400 mt-1">Hoje, 08:00</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>Integrações</CardTitle>
            </div>
            <CardDescription>Conecte outras plataformas ao seu checkout.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground italic">Em breve novas integrações disponíveis.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Separator = () => <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />;
