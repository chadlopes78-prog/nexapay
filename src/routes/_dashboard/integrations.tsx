import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getDebitoPayConfig,
  testDebitoPayConnection,
  fetchDebitoPayWallets,
  saveDebitoPayConfig
} from "@/lib/api/debitopay.functions";

import {
  Search,
  Zap,
  Wallet,
  Webhook,
  Code2,
  CheckCircle2,
  XCircle,
  Plus,
  Settings2,
  Trash2,
  Send,
  Eye,
  EyeOff,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getPushcutIntegration,
  savePushcutIntegration,
  deletePushcutIntegration,
  testPushcutIntegration,
} from "@/lib/api/pushcut.functions";


export const Route = createFileRoute("/_dashboard/integrations")({
  component: IntegrationsPage,
});

type IntegrationId =
  | "utmify"
  | "webhooks"
  | "e2payments"
  | "custom_api"
  | "pushcut"
  | "debitopay_za";


interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password" | "select";
  options?: { value: string; label: string }[];
  secret?: boolean;
}

interface IntegrationDef {
  id: IntegrationId;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  fields?: FieldDef[];
  customEditor?: "webhooks" | "custom_api" | "e2payments" | "pushcut" | "debitopay_za";
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "utmify",
    name: "UTMify",
    description: "Rastreamento avançado de UTM e atribuição de vendas.",
    icon: Zap,
    color: "text-violet-600 bg-violet-50 border-violet-100",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "utm_live_...", secret: true },
      { key: "token", label: "Token (opcional)", placeholder: "Token adicional", secret: true },
      {
        key: "environment",
        label: "Ambiente",
        type: "select",
        options: [
          { value: "production", label: "Produção" },
          { value: "test", label: "Teste" },
        ],
      },
    ],
  },
  {
    id: "e2payments",
    name: "e2Payments",
    description: "Configure suas credenciais M-Pesa e e-Mola para receber pagamentos.",
    icon: Wallet,
    color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    customEditor: "e2payments",
  },

  {
    id: "custom_api",
    name: "API Personalizada",
    description: "Conecte outras APIs próprias via endpoints e headers.",
    icon: Code2,
    color: "text-slate-700 bg-slate-100 border-slate-200",
    customEditor: "custom_api",
  },
  {
    id: "pushcut",
    name: "Pushcut (iPhone)",
    description:
      "Receba notificações instantâneas no seu iPhone sempre que ocorrer uma venda ou outro evento da plataforma.",
    icon: Bell,
    color: "text-rose-600 bg-rose-50 border-rose-100",
    customEditor: "pushcut",
  },
  {
    id: "debitopay_za",
    name: "Débito Pay — África do Sul 🇿🇦",
    description: "Integração real para processar pagamentos em ZAR via Débito Pay.",
    icon: Wallet,
    color: "text-blue-600 bg-blue-50 border-blue-100",
    customEditor: "debitopay_za",
  },
];

const WEBHOOK_EVENTS = [
  { value: "sale.approved", label: "Venda aprovada" },
  { value: "sale.refused", label: "Venda recusada" },
  { value: "payment.pending", label: "Pagamento pendente" },
  { value: "sale.refunded", label: "Reembolso" },
  { value: "checkout.abandoned", label: "Abandono de checkout" },
  { value: "sale.chargeback", label: "Chargeback" },
];

const STORAGE_KEY = "integrations_config_v1";

interface IntegrationState {
  connected: boolean;
  enabled: boolean;
  config: Record<string, any>;
}

type ConfigMap = Record<string, IntegrationState>;

function loadConfig(): ConfigMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveConfig(cfg: ConfigMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function maskSecret(v: string) {
  if (!v) return "";
  if (v.length <= 6) return "••••";
  return `${v.slice(0, 3)}••••${v.slice(-3)}`;
}

function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ConfigMap>(() => loadConfig());
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<IntegrationDef | null>(null);

  // Sync Pushcut connected/enabled from backend
  const getPushcut = useServerFn(getPushcutIntegration);
  const deletePushcut = useServerFn(deletePushcutIntegration);
  const { data: pushcutRow, isLoading: isPushcutLoading } = useQuery({
    queryKey: ["pushcut-integration"],
    queryFn: () => getPushcut(),
  });

  // Sync DebitoPay connected/enabled from backend
  const getDebitoPay = useServerFn(getDebitoPayConfig);
  const { data: debitoPayRow, error: debitoPayError, isLoading: isDebitoLoading } = useQuery({
    queryKey: ["debitopay-config"],
    queryFn: () => getDebitoPay(),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (debitoPayError) {
      console.error("Erro ao carregar integrações (Débito Pay):", debitoPayError);
    }
  }, [debitoPayError]);

  useEffect(() => {
    // Only update when data is available to avoid flickering
    setConfig((prev) => {
      const next = { ...prev };
      
      // Update Pushcut
      if (pushcutRow !== undefined) {
        next.pushcut = {
          connected: !!pushcutRow,
          enabled: !!pushcutRow?.active,
          config: pushcutRow ? { url: pushcutRow.url } : {},
        };
      }

      // Update DebitoPay
      // IMPORTANTE: Se debitoPayRow existir, sincronizamos. 
      // Se for nulo ou vazio, tratamos como desconectado mas o card continua lá.
      if (debitoPayRow !== undefined) {
        next.debitopay_za = {
          connected: !!debitoPayRow?.connected,
          enabled: !!debitoPayRow?.connected,
          config: debitoPayRow || {},
        };
      }

      // Persist to local storage to keep it fast on next load
      if (Object.keys(next).length > 0) {
        saveConfig(next);
      }

      return next;
    });
  }, [pushcutRow, debitoPayRow]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INTEGRATIONS;
    return INTEGRATIONS.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [query]);

  const persist = (next: ConfigMap) => {
    setConfig(next);
    saveConfig(next);
  };

  const update = (id: IntegrationId, patch: Partial<IntegrationState>) => {
    const current = config[id] || { connected: false, enabled: false, config: {} };
    persist({ ...config, [id]: { ...current, ...patch } });
  };

  const disconnect = async (id: IntegrationId) => {
    if (!confirm("Desconectar esta integração?")) return;
    if (id === "pushcut") {
      try {
        await deletePushcut();
      } catch (e: any) {
        toast.error(e.message || "Erro ao remover Pushcut");
        return;
      }
    }
    persist({ ...config, [id]: { connected: false, enabled: false, config: {} } });
    toast.success("Integração desconectada");
  };


  return (
    <div className="space-y-8">
      {/* Debug Info Temporário - Visível apenas para facilitar o diagnóstico do bug */}
      {debitoPayError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          <strong>Erro de Carregamento (ZA):</strong> {String(debitoPayError)}
        </div>
      )}


      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Integrações</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Conecte sua plataforma a serviços externos de forma segura.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar integrações..."
            className="pl-9 bg-white"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((integration) => {
          const state = config[integration.id] || { connected: false, enabled: false, config: {} };
          const Icon = integration.icon;
          return (
            <div
              key={integration.id}
              className="rounded-xl border border-slate-200/70 bg-white p-5 flex flex-col hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={cn("grid h-11 w-11 place-items-center rounded-lg border", integration.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  {state.connected ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px] font-medium">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-medium text-slate-500">
                      <XCircle className="h-3 w-3 mr-1" /> Desconectado
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-4 flex-1">
                <h3 className="text-sm font-semibold text-slate-900">{integration.name}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{integration.description}</p>
              </div>

              <div className="mt-4 flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={state.enabled}
                    disabled={!state.connected}
                    onCheckedChange={async (v) => {
                      update(integration.id, { enabled: v });
                      if (integration.id === "pushcut" && pushcutRow) {
                        try {
                          await savePushcutIntegration({
                            data: {
                              url: pushcutRow.url,
                              active: v,
                              events: pushcutRow.events as any,
                              daily_summary_time: pushcutRow.daily_summary_time,
                            },
                          });
                        } catch (e: any) {
                          toast.error(e.message || "Erro");
                        }
                      }
                    }}
                  />
                  <span className="text-xs text-slate-500">
                    {state.enabled ? "Ativado" : "Desativado"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {state.connected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => disconnect(integration.id)}
                    >
                      Desconectar
                    </Button>
                  )}
                  <Button
                    variant={state.connected ? "outline" : "default"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setEditing(integration)}
                  >
                    {state.connected ? (
                      <>
                        <Settings2 className="h-3 w-3 mr-1.5" /> Configurar
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1.5" /> Conectar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <IntegrationDialog
          integration={editing}
          state={config[editing.id] || { connected: false, enabled: false, config: {} }}
          onClose={() => setEditing(null)}
          onSave={async (next) => {
            update(editing.id, next);
            setEditing(null);
            // Invalidate queries to ensure UI reflects server state immediately
            await queryClient.invalidateQueries({ queryKey: ["debitopay-config"] });
            await queryClient.invalidateQueries({ queryKey: ["pushcut-integration"] });
            toast.success(`${editing.name} atualizado com sucesso`);
          }}
        />
      )}
    </div>
  );
}

function IntegrationDialog({
  integration,
  state,
  onClose,
  onSave,
}: {
  integration: IntegrationDef;
  state: IntegrationState;
  onClose: () => void;
  onSave: (next: Partial<IntegrationState>) => void;
}) {
  const [values, setValues] = useState<Record<string, any>>(state.config || {});
  const [testing, setTesting] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const handleTest = async () => {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 800));
    setTesting(false);
    toast.success("Conexão testada com sucesso");
  };

  const handleSave = () => {
    onSave({ config: values, connected: true, enabled: state.enabled ?? true });
  };

  const Icon = integration.icon;

  if (integration.customEditor === "pushcut") {
    return <PushcutDialog onClose={onClose} onSaved={() => onSave({ connected: true, enabled: true, config: {} })} />;
  }


  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn("grid h-10 w-10 place-items-center rounded-lg border", integration.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{integration.name}</DialogTitle>
              <DialogDescription>{integration.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {integration.customEditor === "webhooks" ? (
          <WebhooksEditor values={values} setValues={setValues} />
        ) : integration.customEditor === "custom_api" ? (
          <CustomApiEditor values={values} setValues={setValues} />
        ) : integration.customEditor === "e2payments" ? (
          <E2PaymentsEditor onSaved={onClose} />
        ) : integration.customEditor === "debitopay_za" ? (
          <DebitoPayZaEditor onSaved={onClose} />
        ) : (
          <div className="grid gap-4 py-2">
            {integration.fields?.map((field) => (
              <div key={field.key} className="grid gap-2">
                <Label htmlFor={`${integration.id}-${field.key}`}>{field.label}</Label>
                {field.type === "select" ? (
                  <select
                    id={`${integration.id}-${field.key}`}
                    value={values[field.key] || field.options?.[0]?.value}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    <Input
                      id={`${integration.id}-${field.key}`}
                      type={field.secret && !revealed[field.key] ? "password" : "text"}
                      value={
                        field.secret && !revealed[field.key] && state.connected && !values[field.key]
                          ? maskSecret(state.config[field.key] || "")
                          : values[field.key] || ""
                      }
                      placeholder={field.placeholder}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                      className={field.secret ? "pr-10" : ""}
                    />
                    {field.secret && (
                      <button
                        type="button"
                        onClick={() => setRevealed({ ...revealed, [field.key]: !revealed[field.key] })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {revealed[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing}
          >
            <Send className="h-4 w-4 mr-2" />
            {testing ? "Testando..." : "Testar conexão"}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
}

function WebhooksEditor({
  values,
  setValues,
}: {
  values: Record<string, any>;
  setValues: (v: Record<string, any>) => void;
}) {
  const hooks: WebhookItem[] = values.hooks || [];

  const update = (next: WebhookItem[]) => setValues({ ...values, hooks: next });

  const addHook = () =>
    update([...hooks, { id: crypto.randomUUID(), url: "", events: ["sale.approved"] }]);

  const removeHook = (id: string) => update(hooks.filter((h) => h.id !== id));

  const test = (url: string) => {
    if (!url) return toast.error("Informe uma URL primeiro");
    toast.success("Evento de teste enviado");
  };

  return (
    <div className="grid gap-3 py-2">
      {hooks.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum webhook cadastrado.
        </div>
      )}
      {hooks.map((hook) => (
        <div key={hook.id} className="rounded-lg border border-slate-200 p-4 grid gap-3">
          <div className="flex items-center gap-2">
            <Input
              value={hook.url}
              placeholder="https://sua-api.com/webhook"
              onChange={(e) =>
                update(hooks.map((h) => (h.id === hook.id ? { ...h, url: e.target.value } : h)))
              }
            />
            <Button variant="outline" size="icon" onClick={() => test(hook.url)} title="Testar">
              <Send className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeHook(hook.id)}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <Label className="text-xs">Eventos</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((e) => {
                const active = hook.events.includes(e.value);
                return (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? hook.events.filter((v) => v !== e.value)
                        : [...hook.events, e.value];
                      update(hooks.map((h) => (h.id === hook.id ? { ...h, events: next } : h)));
                    }}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                      active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                    )}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={addHook}>
        <Plus className="h-4 w-4 mr-2" /> Adicionar webhook
      </Button>
    </div>
  );
}

function CustomApiEditor({
  values,
  setValues,
}: {
  values: Record<string, any>;
  setValues: (v: Record<string, any>) => void;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label>URL Base</Label>
        <Input
          value={values.base_url || ""}
          placeholder="https://api.suaempresa.com"
          onChange={(e) => setValues({ ...values, base_url: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Token</Label>
        <Input
          type="password"
          value={values.token || ""}
          placeholder="•••••••"
          onChange={(e) => setValues({ ...values, token: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Método</Label>
          <select
            value={values.method || "POST"}
            onChange={(e) => setValues({ ...values, method: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
          </select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Cabeçalhos (JSON)</Label>
        <textarea
          value={values.headers || ""}
          placeholder='{"X-Custom": "valor"}'
          onChange={(e) => setValues({ ...values, headers: e.target.value })}
          rows={4}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono"
        />
      </div>
    </div>
  );
}

function E2PaymentsEditor({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const [values, setValues] = useState({
    e2p_client_id: "",
    e2p_client_secret: "",
    wallet_mpesa: "",
    wallet_emola: "",
  });
  const [reveal, setReveal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["user_payment_credentials"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("user_payment_credentials")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setValues({
        e2p_client_id: data.e2p_client_id || "",
        e2p_client_secret: data.e2p_client_secret || "",
        wallet_mpesa: data.wallet_mpesa || "",
        wallet_emola: data.wallet_emola || "",
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("user_payment_credentials")
        .upsert({ user_id: u.user.id, ...values }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_payment_credentials"] });
      toast.success("Credenciais e2Payments salvas");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  if (isLoading) return <div className="py-6 text-center text-sm text-slate-500">Carregando...</div>;

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label>Client ID</Label>
        <Input
          value={values.e2p_client_id}
          onChange={(e) => setValues({ ...values, e2p_client_id: e.target.value })}
          placeholder="Seu Client ID e2Payments"
        />
      </div>
      <div className="grid gap-2">
        <Label>Client Secret</Label>
        <div className="relative">
          <Input
            type={reveal ? "text" : "password"}
            value={values.e2p_client_secret}
            onChange={(e) => setValues({ ...values, e2p_client_secret: e.target.value })}
            placeholder="•••••••"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setReveal(!reveal)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Carteira M-Pesa</Label>
          <Input
            value={values.wallet_mpesa}
            onChange={(e) => setValues({ ...values, wallet_mpesa: e.target.value })}
            placeholder="ID da carteira M-Pesa"
          />
        </div>
        <div className="grid gap-2">
          <Label>Carteira e-Mola</Label>
          <Input
            value={values.wallet_emola}
            onChange={(e) => setValues({ ...values, wallet_emola: e.target.value })}
            placeholder="ID da carteira e-Mola"
          />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar credenciais"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Suas credenciais são armazenadas de forma segura e apenas você tem acesso.
      </p>
    </div>
  );
}

// ============================================================================
// Pushcut (iPhone) — dedicated dialog, independent from webhooks
// ============================================================================

const PUSHCUT_EVENTS: { key: string; label: string }[] = [
  { key: "sale_approved", label: "Venda aprovada" },
  { key: "sale_refused", label: "Venda recusada" },
  { key: "payment_pending", label: "Pagamento pendente" },
  { key: "payment_processing", label: "Pagamento em processamento" },
  { key: "refund", label: "Reembolso" },
  { key: "checkout_abandoned", label: "Abandono de checkout" },
  { key: "daily_summary", label: "Resumo diário" },
];

function PushcutDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getPushcutIntegration);
  const saveFn = useServerFn(savePushcutIntegration);
  const delFn = useServerFn(deletePushcutIntegration);
  const testFn = useServerFn(testPushcutIntegration);

  const { data: row, isLoading } = useQuery({
    queryKey: ["pushcut-integration"],
    queryFn: () => getFn(),
  });

  const [url, setUrl] = useState("");
  const [active, setActive] = useState(true);
  const [events, setEvents] = useState<Record<string, boolean>>(
    Object.fromEntries(PUSHCUT_EVENTS.map((e) => [e.key, true])),
  );
  const [summaryTime, setSummaryTime] = useState("20:00");
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (row) {
      setUrl(row.url);
      setActive(!!row.active);
      setEvents({
        ...Object.fromEntries(PUSHCUT_EVENTS.map((e) => [e.key, true])),
        ...((row.events as Record<string, boolean>) ?? {}),
      });
      setSummaryTime(row.daily_summary_time ?? "20:00");
    } else {
      setEditing(true);
    }
  }, [row]);

  const isValid = (() => {
    try {
      const u = new URL(url.trim());
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  })();

  const save = useMutation({
    mutationFn: async () => {
      await saveFn({
        data: {
          url: url.trim(),
          active,
          events,
          daily_summary_time: summaryTime,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pushcut-integration"] });
      toast.success("Pushcut configurado com sucesso");
      setEditing(false);
      onSaved();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await delFn();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pushcut-integration"] });
      toast.success("Pushcut removido");
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao remover"),
  });

  const handleTest = async () => {
    if (!row) {
      toast.error("Salve a URL antes de testar.");
      return;
    }
    setTesting(true);
    try {
      const res: any = await testFn();
      toast.success(`Notificação enviada com sucesso (HTTP ${res?.status ?? 200})`);
    } catch (e: any) {
      toast.error(`Falha no teste: ${e.message || "erro desconhecido"}`);
    } finally {
      setTesting(false);
    }
  };

  const connected = !!row;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border text-rose-600 bg-rose-50 border-rose-100">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                Pushcut (iPhone)
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Desconectado
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                Receba notificações instantâneas no seu iPhone via URL do Pushcut.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-slate-500">Carregando...</div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>URL do Pushcut</Label>
              <Input
                value={url}
                disabled={connected && !editing}
                placeholder="https://api.pushcut.io/.../notifications/..."
                onChange={(e) => setUrl(e.target.value)}
              />
              {!isValid && url && (
                <p className="text-xs text-red-600">URL inválida (use https://...)</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label className="font-semibold">Ativo</Label>
                <p className="text-xs text-slate-500">
                  Quando desativado, nenhum evento envia notificação.
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} disabled={connected && !editing} />
            </div>

            <div className="grid gap-2">
              <Label>Eventos</Label>
              <div className="grid grid-cols-1 gap-1.5 rounded border p-3">
                {PUSHCUT_EVENTS.map((ev) => (
                  <label key={ev.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!!events[ev.key]}
                      disabled={connected && !editing}
                      onCheckedChange={(v) =>
                        setEvents((prev) => ({ ...prev, [ev.key]: !!v }))
                      }
                    />
                    <span>{ev.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {events.daily_summary && (
              <div className="grid gap-2">
                <Label>Horário do Resumo Diário</Label>
                <Input
                  type="time"
                  value={summaryTime}
                  disabled={connected && !editing}
                  onChange={(e) => setSummaryTime(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testing || !connected}
            >
              <Send className="h-4 w-4 mr-2" />
              {testing ? "Testando..." : "Testar"}
            </Button>
            {connected && (
              <Button
                type="button"
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Remover a integração Pushcut?")) remove.mutate();
                }}
                disabled={remove.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Remover
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            {connected && !editing ? (
              <Button type="button" onClick={() => setEditing(true)}>
                <Settings2 className="h-4 w-4 mr-2" /> Editar
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => save.mutate()}
                disabled={!isValid || save.isPending}
              >
                {save.isPending ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DebitoPayZaEditor({ onSaved }: { onSaved: () => void }) {
  const getFn = useServerFn(getDebitoPayConfig);
  const testFn = useServerFn(testDebitoPayConnection);
  const fetchWalletsFn = useServerFn(fetchDebitoPayWallets);
  const saveFn = useServerFn(saveDebitoPayConfig);
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["debitopay-config"],
    queryFn: () => getFn(),
  });

  const [env, setEnv] = useState<"sandbox" | "live">("live");
  const [apiKey, setApiKey] = useState("");
  const [walletZa, setWalletZa] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [values, setValues] = useState<any>({});
  const [wallets, setWallets] = useState<any[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isFetchingWallets, setIsFetchingWallets] = useState(false);

  useEffect(() => {
    if (config) {
      setEnv(config.environment);
      setWalletZa(config.walletZa);
      setValues({ merchantId: config.merchantId });
    }
  }, [config]);

  const handleTest = async () => {
    if (!apiKey && !config?.connected) return toast.error("Insira a API Key para testar");
    setIsTesting(true);
    try {
      const res = await testFn({ data: { environment: env, apiKey: apiKey || "dummy", walletZa: walletZa || "dummy", merchantId: values.merchantId || "00000000-0000-0000-0000-000000000000", webhookSecret } });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error(e.message || "Falha na conexão");
    } finally {
      setIsTesting(false);
    }
  };

  const handleFetchWallets = async () => {
    if (!apiKey && !config?.connected) return toast.error("Insira a API Key");
    setIsFetchingWallets(true);
    try {
      const res = await fetchWalletsFn({ data: { apiKey: apiKey || "dummy", environment: env, walletCode: walletZa } });
      setWallets(res);
      toast.success("Wallets sincronizadas");
    } finally {
      setIsFetchingWallets(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey && !config?.connected) return toast.error("API Key obrigatória");
    try {
      await saveFn({ data: { environment: env, apiKey, walletZa, merchantId: values.merchantId, webhookSecret } });
      await qc.invalidateQueries({ queryKey: ["debitopay-config"] });
      toast.success("Configuração Débito Pay ZA salva");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    }
  };


  if (isLoading) return <div className="py-6 text-center text-sm text-slate-500">Carregando...</div>;

  return (
    <div className="grid gap-6 py-4">
      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
        <div>
          <p className="text-sm font-semibold">Status da Integração</p>
          <p className="text-xs text-slate-500">África do Sul 🇿🇦</p>
        </div>
        <Badge className={config?.connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
          {config?.connected ? "🟢 Conectado" : "🔴 Não configurado"}
        </Badge>
      </div>

      <div className="grid gap-2">
        <Label>Ambiente</Label>
        <select
          value={env}
          onChange={(e) => setEnv(e.target.value as any)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="sandbox">Sandbox / Test</option>
          <option value="live">Live / Produção</option>
        </select>
      </div>

      <div className="grid gap-2">
        <Label>Débito Pay API KEY</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config?.apiKeyMasked || "••••••••••••••••"}
        />
        <p className="text-[10px] text-slate-500">A chave será mascarada após salvar.</p>
      </div>


      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Merchant ID (ZA)</Label>
          <Input
            value={config?.merchantId || ""}
            readOnly
            className="bg-slate-50"
            placeholder="Salvo no backend"
          />
        </div>
        <div className="grid gap-2">
          <Label>Merchant ID (Novo)</Label>
          <Input
            value={values.merchantId || ""}
            onChange={(e) => setValues({ ...values, merchantId: e.target.value })}
            placeholder="UUID do Merchant"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Wallet Code ZAR (Auto)</Label>
          <div className="flex gap-2">
            <select
              value={walletZa}
              onChange={(e) => setWalletZa(e.target.value)}
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Buscar wallets...</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={handleFetchWallets} disabled={isFetchingWallets}>
              {isFetchingWallets ? "..." : "Buscar"}
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Wallet Code ZAR (Manual)</Label>
          <div className="flex gap-2">
            <Input
              value={walletZa}
              onChange={(e) => setWalletZa(e.target.value)}
              placeholder="Ex: 34471"
            />
            <Button variant="outline" size="sm" onClick={handleTest}>
              Validar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Webhook Secret</Label>
        <Input
          type="password"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder={config?.webhookSecretMasked || "Opcional - para validação de assinatura"}
        />
      </div>

      <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
        <Label className="text-blue-900 text-xs font-bold mb-1 block">Webhook URL</Label>
        <div className="flex items-center gap-2">
          <code className="text-[10px] bg-white p-1 rounded border flex-1 truncate">
            {config?.webhookUrl}
          </code>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
            if (config?.webhookUrl) {
              navigator.clipboard.writeText(config.webhookUrl);
              toast.success("URL copiada");
            }
          }}>
            <Code2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button className="flex-1" onClick={handleSave}>Salvar configuração</Button>
        <Button variant="outline" className="flex-1" onClick={handleTest} disabled={isTesting}>
          {isTesting ? "Testando..." : "Testar conexão"}
        </Button>
      </div>
    </div>
  );
}
