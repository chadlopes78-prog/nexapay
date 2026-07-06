import { NotificationPreferences } from "@/components/dashboard/NotificationPreferences";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Shield,
  Bell,
  User,
  Lock,
  Trash2,
  AlertTriangle,
  Wallet,
  Zap,
  Settings2,
  Code2,
  Smartphone,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { PushNotificationManager } from "@/components/dashboard/PushNotificationManager";
import { WebhooksSection } from "@/components/dashboard/WebhooksSection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type SectionId =
  | "profile"
  | "security"
  | "payouts"
  | "notifications"
  | "integrations"
  | "preferences"
  | "developer"
  | "danger";

const SECTIONS: {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "profile", label: "Perfil da Conta", description: "Seus dados pessoais", icon: User },
  { id: "security", label: "Segurança", description: "Senha e acesso", icon: Shield },
  { id: "payouts", label: "Recebimentos", description: "Carteiras e pagamentos", icon: Wallet },
  
  { id: "integrations", label: "Integrações", description: "Serviços externos", icon: Zap },
  { id: "preferences", label: "Preferências", description: "Tema, idioma e região", icon: Settings2 },
  { id: "developer", label: "API e Desenvolvedor", description: "Chaves, webhooks e logs", icon: Code2 },
  { id: "danger", label: "Zona de Perigo", description: "Ações irreversíveis", icon: Trash2 },
];

export const Route = createFileRoute("/_dashboard/settings")({
  validateSearch: (s: Record<string, unknown>) => ({
    section: (s.section as SectionId) || "profile",
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { section } = Route.useSearch();
  const [active, setActive] = useState<SectionId>(section || "profile");

  useEffect(() => {
    if (section && section !== active) setActive(section);
  }, [section]);

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-12">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie sua conta, integrações e preferências da plataforma.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="rounded-xl border border-slate-200/70 bg-white p-2">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              const isDanger = s.id === "danger";
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                    isActive
                      ? isDanger
                        ? "bg-rose-50 text-rose-700"
                        : "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isDanger && "text-rose-600")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.label}</div>
                    <div className="text-[11px] text-slate-500 truncate">{s.description}</div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <section className="min-w-0 space-y-6">
          {active === "profile" && <ProfileSection />}
          {active === "security" && <SecuritySection />}
          {active === "payouts" && <PayoutsSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "integrations" && <IntegrationsSection />}
          {active === "preferences" && <PreferencesSection />}
          {active === "developer" && <DeveloperSection />}
          {active === "danger" && <DangerSection />}
        </section>
      </div>
    </div>
  );
}

/* ================= Sections ================= */

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <div className="p-2 rounded-lg bg-slate-100">
        <Icon className="h-4 w-4 text-slate-700" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function ProfileSection() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (error && error.code !== "PGRST116") throw error;
      return { ...data, email: user.email };
    },
  });

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
    if ((profile as any)?.company_name) setCompany((profile as any).company_name);
    if ((profile as any)?.phone) setPhone((profile as any).phone);
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: fullName,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Perfil atualizado!");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <Card className="border-slate-200/70 shadow-none rounded-xl">
      <CardHeader>
        <SectionHeader icon={User} title="Perfil da Conta" description="Suas informações pessoais e da empresa" />
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="text-sm text-slate-500">Carregando...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nome completo">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
              </Field>
              <Field label="Nome da empresa">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Opcional" />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={profile?.email || ""} disabled />
              </Field>
              <Field label="Telefone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+258 ..." />
              </Field>
              <Field label="País">
                <Input defaultValue="Moçambique" disabled />
              </Field>
              <Field label="Idioma">
                <Input defaultValue="Português (BR)" disabled />
              </Field>
              <Field label="Fuso horário">
                <Input defaultValue="África/Maputo (GMT+2)" disabled />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SecuritySection() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  const changePassword = async () => {
    if (!pw || pw.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (pw !== pw2) return toast.error("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada com sucesso!");
    setPw("");
    setPw2("");
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/70 shadow-none rounded-xl">
        <CardHeader>
          <SectionHeader icon={Shield} title="Segurança" description="Proteja sua conta com senha forte e 2FA" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nova senha">
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
            </Field>
            <Field label="Confirmar nova senha">
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" className="gap-2" onClick={changePassword} disabled={loading}>
              <Lock className="h-4 w-4" />
              {loading ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/70 shadow-none rounded-xl">
        <CardContent className="p-5 space-y-4">
          <SoonRow title="Autenticação em dois fatores (2FA)" description="Adicione uma camada extra de proteção via app autenticador." />
          <SoonRow title="Sessões ativas" description="Veja onde sua conta está conectada e encerre sessões remotamente." />
          <SoonRow title="Histórico de login" description="Registro dos últimos acessos e dispositivos usados." />
          <SoonRow title="Alterar e-mail" description="Substitua o e-mail principal da conta com verificação." />
        </CardContent>
      </Card>
    </div>
  );
}

function PayoutsSection() {
  return (
    <Card className="border-slate-200/70 shadow-none rounded-xl">
      <CardHeader>
        <SectionHeader icon={Wallet} title="Recebimentos" description="Carteiras e integrações de pagamento" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-slate-200 bg-slate-50/50">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">E2Payments</span>
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Conectado
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Provedor ativo para M-Pesa e e-Mola. Configurado via variáveis do sistema.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled>Testar conexão</Button>
        </div>
        <SoonRow title="Conta de recebimento" description="Selecione a carteira padrão para créditos das vendas." />
        <SoonRow title="Processamento por documento" description="Aplique regras específicas por CPF/BI ou tipo de documento." />
      </CardContent>
    </Card>
  );
}

function NotificationsSection() {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200/70 shadow-none rounded-xl">
        <CardHeader>
          <SectionHeader icon={Smartphone} title="Notificações push" description="Ative alertas em tempo real no dispositivo" />
        </CardHeader>
        <CardContent>
          <PushNotificationManager />
        </CardContent>
      </Card>

      <Card className="border-slate-200/70 shadow-none rounded-xl">
        <CardHeader>
          <SectionHeader icon={Bell} title="Eventos" description="Escolha quais eventos disparam notificações" />
        </CardHeader>
        <CardContent>
          <NotificationPreferences />
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsSection() {
  return (
    <Card className="border-slate-200/70 shadow-none rounded-xl">
      <CardHeader>
        <SectionHeader icon={Zap} title="Integrações" description="UTMify, GA4, GTM, Meta CAPI, TikTok, Google Ads e mais" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600 mb-4">
          Todas as integrações da plataforma agora ficam centralizadas em um painel dedicado.
        </p>
        <Button asChild>
          <Link to="/integrations" className="gap-2">
            Abrir painel de Integrações <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function PreferencesSection() {
  return (
    <Card className="border-slate-200/70 shadow-none rounded-xl">
      <CardHeader>
        <SectionHeader icon={Settings2} title="Preferências da plataforma" description="Personalize a experiência visual e regional" />
      </CardHeader>
      <CardContent className="space-y-4">
        <SoonRow title="Tema (claro/escuro)" description="Alterne entre tema claro e escuro." />
        <SoonRow title="Idioma" description="Português (BR) — mais idiomas em breve." />
        <SoonRow title="Formato de data" description="Ex.: DD/MM/AAAA" />
        <SoonRow title="Formato de hora" description="24h (padrão)" />
        <SoonRow title="Moeda" description="MZN (Metical) — definido pelo sistema" locked />
        <SoonRow title="Configurações regionais" description="Fuso horário, separadores numéricos e mais." />
      </CardContent>
    </Card>
  );
}

function DeveloperSection() {
  return (
    <div className="space-y-6">
      <WebhooksSection />
      <Card className="border-slate-200/70 shadow-none rounded-xl">
        <CardHeader>
          <SectionHeader icon={Code2} title="API e desenvolvedor" description="Chaves, tokens e logs de integração" />
        </CardHeader>
        <CardContent className="space-y-4">
          <SoonRow title="Chaves da API" description="Gere e revogue chaves para integração server-to-server." />
          <SoonRow title="Tokens de acesso" description="Tokens temporários com escopo restrito." />
          <SoonRow title="Documentação" description="Guia oficial de endpoints e exemplos." />
          <SoonRow title="Logs de integração" description="Histórico de chamadas e respostas de webhooks." />
        </CardContent>
      </Card>
    </div>
  );
}

function DangerSection() {
  const queryClient = useQueryClient();
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const resetData = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { data: userProducts } = await supabase.from("products").select("id").eq("user_id", user.id);
      const productIds = userProducts?.map((p) => p.id) || [];
      if (productIds.length > 0) {
        const { error: salesError } = await supabase.from("sales").delete().in("product_id", productIds);
        if (salesError) throw salesError;
        const { data: userPages } = await supabase.from("traffic_pages").select("id").in("product_id", productIds);
        const pageIds = userPages?.map((p) => p.id) || [];
        if (pageIds.length > 0) {
          const { error: eventsError } = await supabase.from("traffic_events").delete().in("page_id", pageIds);
          if (eventsError) throw eventsError;
        }
      }
      const { error: notifyError } = await supabase.from("notifications_log").delete().eq("user_id", user.id);
      if (notifyError) throw notifyError;
      const { error: alertsError } = await supabase.from("marketing_alerts").delete().eq("user_id", user.id);
      if (alertsError) throw alertsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Todos os dados foram resetados!");
      setIsResetDialogOpen(false);
      setResetConfirmText("");
    },
    onError: (e: any) => toast.error("Erro ao resetar: " + e.message),
  });

  return (
    <Card className="border-rose-200 bg-rose-50/30 rounded-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-100">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div>
            <CardTitle className="text-lg text-rose-700">Zona de Perigo</CardTitle>
            <CardDescription>Ações irreversíveis para sua conta e dados</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-rose-200 bg-white">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">Limpar dados / Reiniciar sistema</p>
            <p className="text-sm text-slate-500 mt-1">
              Apaga todas as vendas, tráfego e notificações. Conta e produtos permanecem.
            </p>
          </div>
          <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Reset total</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md rounded-2xl">
              <AlertDialogHeader>
                <div className="flex items-center gap-3 text-rose-600 mb-2">
                  <div className="p-2 bg-rose-100 rounded-xl">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <AlertDialogTitle className="text-lg font-semibold">Confirmar reset</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-slate-600">
                  Esta ação apagará permanentemente vendas, tráfego e notificações.{" "}
                  <span className="text-rose-600 font-medium">Não há como desfazer.</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-3 space-y-2">
                <p className="text-xs text-slate-500">
                  Digite <span className="font-mono font-semibold text-slate-700">CONFIRMAR RESET</span> para prosseguir:
                </p>
                <Input
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="CONFIRMAR RESET"
                  className="h-11 rounded-lg"
                />
              </div>
              <AlertDialogFooter className="gap-2 sm:gap-0">
                <AlertDialogCancel
                  onClick={() => {
                    setResetConfirmText("");
                    setIsResetDialogOpen(false);
                  }}
                  className="h-10 rounded-lg"
                >
                  Cancelar
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={resetConfirmText !== "CONFIRMAR RESET" || resetData.isPending}
                  onClick={() => resetData.mutate()}
                  className="h-10 rounded-lg px-5"
                >
                  {resetData.isPending ? "Limpando..." : "Confirmar"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================= Helpers ================= */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

function SoonRow({
  title,
  description,
  locked = false,
}: {
  title: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
        {locked ? "Sistema" : "Em breve"}
      </Badge>
    </div>
  );
}
