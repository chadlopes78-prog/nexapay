import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Webhook, Plus, Pencil, Trash2, Send, History, CheckCircle2, XCircle, Clock } from "lucide-react";
import { WEBHOOK_EVENTS, type WebhookEventId } from "@/lib/webhooks/events";
import { upsertWebhook, deleteWebhook, testWebhook } from "@/lib/api/webhooks.functions";

interface Endpoint {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  is_pushcut: boolean;
  active: boolean;
}

interface Delivery {
  id: string;
  webhook_id: string;
  event: string;
  status: string;
  attempts: number;
  response_code: number | null;
  error: string | null;
  created_at: string;
}

export function WebhooksSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [open, setOpen] = useState(false);

  const upsert = useServerFn(upsertWebhook);
  const del = useServerFn(deleteWebhook);
  const test = useServerFn(testWebhook);

  const { data: hooks } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Endpoint[];
    },
  });

  const { data: deliveries } = useQuery({
    queryKey: ["webhook-deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("id, webhook_id, event, status, attempts, response_code, error, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
    refetchInterval: 10_000,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook removido");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook-deliveries"] });
      toast.success("Teste enviado — veja o histórico");
    },
    onError: (e: any) => toast.error("Falha no teste: " + e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <CardTitle>Webhooks e Eventos</CardTitle>
            </div>
            <CardDescription>
              Receba notificações em tempo real para cada etapa da venda. Compatível com Pushcut,
              Zapier, Make, n8n, CRMs e automações.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4" /> Novo
              </Button>
            </DialogTrigger>
            <EndpointDialog
              initial={editing}
              onClose={() => { setOpen(false); setEditing(null); }}
              onSave={async (payload) => {
                await upsert({ data: payload });
                qc.invalidateQueries({ queryKey: ["webhooks"] });
                toast.success(payload.id ? "Webhook atualizado" : "Webhook criado");
                setOpen(false); setEditing(null);
              }}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          {(hooks ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Nenhum webhook configurado ainda. Clique em "Novo" para começar.
            </p>
          )}
          {(hooks ?? []).map((h) => (
            <div key={h.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{h.name}</span>
                  {h.is_pushcut && <Badge variant="secondary">Pushcut</Badge>}
                  {!h.active && <Badge variant="outline">Inativo</Badge>}
                  <Badge variant="outline" className="text-xs">{h.events.length} evento(s)</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">{h.url}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => testMut.mutate(h.id)} disabled={testMut.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(h); setOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost"
                  onClick={() => { if (confirm("Remover este webhook?")) removeMut.mutate(h.id); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Histórico de envios</h3>
          </div>
          <div className="space-y-1 max-h-72 overflow-auto">
            {(deliveries ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sem envios ainda.</p>
            )}
            {(deliveries ?? []).map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs p-2 rounded border bg-card">
                <StatusIcon status={d.status} />
                <span className="font-mono">{d.event}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {new Date(d.created_at).toLocaleString("pt-PT")}
                </span>
                {d.response_code != null && (
                  <Badge variant="outline" className="ml-auto">HTTP {d.response_code}</Badge>
                )}
                {d.attempts > 1 && <span className="text-amber-600">×{d.attempts}</span>}
                {d.error && <span className="text-destructive truncate max-w-[200px]">{d.error}</span>}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

interface DialogProps {
  initial: Endpoint | null;
  onClose: () => void;
  onSave: (payload: {
    id?: string; name: string; url: string; secret: string | null;
    events: string[]; is_pushcut: boolean; active: boolean;
  }) => Promise<void>;
}

function EndpointDialog({ initial, onSave }: DialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [secret, setSecret] = useState(initial?.secret ?? "");
  const [isPushcut, setIsPushcut] = useState(initial?.is_pushcut ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [events, setEvents] = useState<string[]>(initial?.events ?? ["sale.approved"]);
  const [saving, setSaving] = useState(false);

  const toggleEvent = (id: WebhookEventId) =>
    setEvents((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar Webhook" : "Novo Webhook"}</DialogTitle>
        <DialogDescription>
          Endpoint HTTPS que receberá os eventos selecionados. Use Pushcut para notificações no iPhone.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meu CRM" />
        </div>
        <div className="space-y-2">
          <Label>URL</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.pushcut.io/.../notifications/..." />
        </div>
        <div className="flex items-center justify-between rounded border p-3">
          <div className="space-y-0.5">
            <Label className="font-semibold">Modo Pushcut</Label>
            <p className="text-xs text-muted-foreground">Formata payload como notificação Pushcut.</p>
          </div>
          <Switch checked={isPushcut} onCheckedChange={setIsPushcut} />
        </div>
        {!isPushcut && (
          <div className="space-y-2">
            <Label>Secret (opcional)</Label>
            <Input value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder="Enviado no header X-Webhook-Secret" />
          </div>
        )}
        <div className="flex items-center justify-between rounded border p-3">
          <Label className="font-semibold">Ativo</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <div className="space-y-2">
          <Label>Eventos</Label>
          <div className="grid grid-cols-1 gap-2 max-h-56 overflow-auto rounded border p-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={events.includes(ev.id)}
                  onCheckedChange={() => toggleEvent(ev.id)} className="mt-0.5" />
                <span>
                  <span className="font-medium">{ev.label}</span>
                  <span className="block text-xs text-muted-foreground">{ev.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          disabled={saving || !name || !url || events.length === 0}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                id: initial?.id, name, url,
                secret: secret || null,
                events, is_pushcut: isPushcut, active,
              });
            } catch (e: any) {
              toast.error(e.message || "Erro ao salvar");
            } finally { setSaving(false); }
          }}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
