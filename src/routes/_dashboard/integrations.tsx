import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Zap,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_dashboard/integrations")({
  component: IntegrationsPage,
});

type IntegrationId =
  | "utmify"
  | "ga4"
  | "gtm"
  | "meta_capi"
  | "tiktok_pixel"
  | "google_ads"
  | "webhooks"
  | "custom_api";

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
  customEditor?: "webhooks" | "custom_api";
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
    id: "webhooks",
    name: "Webhooks",
    description: "Envie eventos em tempo real para URLs personalizadas.",
    icon: Webhook,
    color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    customEditor: "webhooks",
  },
  {
    id: "custom_api",
    name: "API Personalizada",
    description: "Integre com sua própria API interna.",
    icon: Code2,
    color: "text-slate-700 bg-slate-100 border-slate-200",
    customEditor: "custom_api",
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
  const [config, setConfig] = useState<ConfigMap>(() => loadConfig());
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<IntegrationDef | null>(null);

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

  const disconnect = (id: IntegrationId) => {
    if (!confirm("Desconectar esta integração?")) return;
    persist({ ...config, [id]: { connected: false, enabled: false, config: {} } });
    toast.success("Integração desconectada");
  };

  return (
    <div className="space-y-8">
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
                    onCheckedChange={(v) => update(integration.id, { enabled: v })}
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
          onSave={(next) => {
            update(editing.id, next);
            setEditing(null);
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
