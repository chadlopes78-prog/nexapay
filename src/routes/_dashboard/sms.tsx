import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Loader2, Save, Send, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getSmsSettings,
  saveSmsSettings,
  sendTestSms,
  type SmsTemplateItem,
} from "@/lib/api/sms.functions";

export const Route = createFileRoute("/_dashboard/sms")({
  component: SmsPage,
  head: () => ({
    meta: [
      { title: "Configuração de SMS | NexaPay" },
      {
        name: "description",
        content: "Configure as mensagens automáticas de SMS enviadas aos seus clientes na NexaPay.",
      },
      { property: "og:title", content: "Configuração de SMS | NexaPay" },
      {
        property: "og:description",
        content: "Configure as mensagens automáticas de SMS enviadas aos seus clientes na NexaPay.",
      },
    ],
  }),
});

const VARIABLES = ["{nome}", "{valor}", "{produto}", "{telefone}", "{data}", "{transacao}"];

const PREVIEW_VARS: Record<string, string> = {
  "{nome}": "João",
  "{valor}": "350",
  "{produto}": "Curso de Marketing",
  "{telefone}": "+258841234567",
  "{data}": new Date().toLocaleDateString("pt-PT"),
  "{transacao}": "TX123456",
};

function renderPreview(template: string): string {
  let out = template;
  for (const [key, value] of Object.entries(PREVIEW_VARS)) {
    out = out.split(key).join(value);
  }
  return out;
}

type DelayUnit = "minutes" | "hours";

function splitDelay(minutes: number): { value: number; unit: DelayUnit } {
  if (minutes > 0 && minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

function SmsPage() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getSmsSettings);
  const persistSettings = useServerFn(saveSmsSettings);
  const runTestSms = useServerFn(sendTestSms);

  const { data, isLoading } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: () => fetchSettings(),
  });

  const [enabled, setEnabled] = useState(false);
  const [sender, setSender] = useState("11480");
  const [testPhone, setTestPhone] = useState("");
  const [smsCount, setSmsCount] = useState(1);
  const [messages, setMessages] = useState<SmsTemplateItem[]>([
    { body: "", delay_minutes: 0 },
  ]);

  useEffect(() => {
    if (!data?.settings) return;
    setEnabled(data.settings.enabled);
    setSender(data.settings.sender);
    setTestPhone(data.settings.test_phone ?? "");
    setSmsCount(data.settings.sms_count);
    setMessages(
      data.settings.messages.length > 0
        ? data.settings.messages
        : [{ body: data.settings.message_paid, delay_minutes: 0 }],
    );
  }, [data]);

  // Ajusta a lista de editores à quantidade escolhida (estado derivado controlado).
  const visibleMessages = useMemo<SmsTemplateItem[]>(() => {
    const out: SmsTemplateItem[] = [];
    for (let i = 0; i < smsCount; i++) {
      out.push(messages[i] ?? { body: "", delay_minutes: i === 0 ? 0 : 5 });
    }
    return out;
  }, [messages, smsCount]);

  const updateMessage = (index: number, patch: Partial<SmsTemplateItem>) => {
    setMessages(() =>
      visibleMessages.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  };

  const save = useMutation({
    mutationFn: () =>
      persistSettings({
        data: {
          enabled,
          sender,
          message_paid: visibleMessages[0]?.body ?? "",
          test_phone: testPhone || null,
          sms_count: smsCount,
          messages: visibleMessages,
        },
      }),
    onSuccess: () => {
      toast.success("Configurações de SMS guardadas.");
      queryClient.invalidateQueries({ queryKey: ["sms-settings"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar."),
  });

  const sendTest = useMutation({
    mutationFn: () => {
      // Validação antes de consumir crédito de SMS.
      if (!testPhone.trim()) throw new Error("Indique o número para teste.");
      const body = visibleMessages[0]?.body?.trim();
      if (!body) throw new Error("A mensagem não pode estar vazia.");
      return runTestSms({ data: { phone: testPhone.trim(), message: body } });
    },
    onSuccess: () => toast.success("SMS enviado com sucesso."),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a SMS."),
  });

  // A integração só é considerada pronta quando o backend tem API Key + endpoint.
  const integrationReady = Boolean(data?.hasApiKey && data?.hasEndpoint);
  const configured = Boolean(data?.exists && integrationReady);

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuração de SMS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure as mensagens automáticas enviadas aos clientes após um pagamento aprovado.
        </p>
      </header>

      {/* Estado da integração */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <MessageSquare className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">BulkSMS Moçambique</p>
              <p className="text-xs text-muted-foreground">Envio de SMS transacionais</p>
            </div>
          </div>
          <Badge variant={configured ? "default" : "secondary"} className="gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                configured ? "bg-emerald-500" : "bg-muted-foreground",
              )}
            />
            {configured ? "Configurado" : "Não configurado"}
          </Badge>
        </div>
      </section>

      {/* Configuração */}
      <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="sms-enabled" className="text-sm font-medium">
              Ativar envio automático de SMS
            </Label>
            <p className="text-xs text-muted-foreground">
              Quando ativo, as mensagens são enviadas apenas após a confirmação real do pagamento.
            </p>
          </div>
          <Switch id="sms-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">Remetente padrão da BulkSMS</p>
          <p className="text-xs text-muted-foreground/80">
            O envio utiliza o remetente predefinido da operadora.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sms-count">Quantidade de SMS após compra aprovada</Label>
          <Select value={String(smsCount)} onValueChange={(v) => setSmsCount(Number(v))}>
            <SelectTrigger id="sms-count" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} SMS
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Máximo de 5 SMS por compra.</p>
        </div>
      </section>

      {/* Mensagens */}
      <section className="space-y-4">
        {visibleMessages.map((msg, index) => {
          const delay = splitDelay(msg.delay_minutes);
          return (
            <div key={index} className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">SMS {index + 1}</h2>
                {index === 0 ? (
                  <Badge variant="secondary" className="gap-1.5">
                    <Clock className="h-3 w-3" />
                    Imediatamente após confirmação
                  </Badge>
                ) : null}
              </div>

              <Textarea
                value={msg.body}
                onChange={(e) => updateMessage(index, { body: e.target.value })}
                rows={4}
                maxLength={800}
                placeholder="Olá {nome}, recebemos o seu pagamento de {valor} MT referente a {produto}."
              />

              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateMessage(index, { body: `${msg.body}${v}` })}
                    className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent"
                  >
                    {v}
                  </button>
                ))}
              </div>

              {index > 0 && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`sms-delay-${index}`} className="text-xs">
                      Enviar após
                    </Label>
                    <Input
                      id={`sms-delay-${index}`}
                      type="number"
                      min={0}
                      className="w-28"
                      value={delay.value}
                      onChange={(e) =>
                        updateMessage(index, {
                          delay_minutes:
                            Math.max(0, Number(e.target.value) || 0) *
                            (delay.unit === "hours" ? 60 : 1),
                        })
                      }
                    />
                  </div>
                  <Select
                    value={delay.unit}
                    onValueChange={(unit) =>
                      updateMessage(index, {
                        delay_minutes:
                          unit === "hours" ? delay.value * 60 : Math.max(1, delay.value),
                      })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">minutos</SelectItem>
                      <SelectItem value="hours">horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">Pré-visualização</p>
                <p className="mt-1 text-sm text-foreground">
                  {msg.body.trim() ? renderPreview(msg.body) : "—"}
                </p>
              </div>
            </div>
          );
        })}

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar configurações
        </Button>
      </section>

      {/* Testar SMS */}
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Testar SMS</h2>
          <p className="text-xs text-muted-foreground">
            Envie uma mensagem real para validar a integração. Independente das compras.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sms-test">Número para teste</Label>
          <Input
            id="sms-test"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="258841234567"
            inputMode="numeric"
          />
        </div>

        <Button
          variant="outline"
          disabled={!integrationReady || sendTest.isPending}
          onClick={() => sendTest.mutate()}
          className="w-full sm:w-auto"
        >
          {sendTest.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {sendTest.isPending ? "A enviar..." : "Enviar SMS de teste"}
        </Button>

        {!integrationReady && (
          <p className="text-xs text-muted-foreground">
            Configure a integração para realizar um teste.
          </p>
        )}
      </section>
    </div>
  );
}
