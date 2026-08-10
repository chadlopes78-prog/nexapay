import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSmsSettings, saveSmsSettings, sendTestSms } from "@/lib/api/sms.functions";

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

function SmsPage() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getSmsSettings);
  const persistSettings = useServerFn(saveSmsSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: () => fetchSettings(),
  });

  const [enabled, setEnabled] = useState(false);
  const [sender, setSender] = useState("11480");
  const [message, setMessage] = useState("");
  const [testPhone, setTestPhone] = useState("");

  useEffect(() => {
    if (!data?.settings) return;
    setEnabled(data.settings.enabled);
    setSender(data.settings.sender);
    setMessage(data.settings.message_paid);
    setTestPhone(data.settings.test_phone ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      persistSettings({
        data: { enabled, sender, message_paid: message, test_phone: testPhone || null },
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
      if (!message.trim()) throw new Error("A mensagem não pode estar vazia.");
      return runTestSms({ data: { phone: testPhone.trim(), message: message.trim() } });
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
          Configure as mensagens automáticas enviadas aos clientes.
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
              Quando ativo, as mensagens serão enviadas após a integração estar concluída.
            </p>
          </div>
          <Switch id="sms-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sms-sender">Sender</Label>
          <Input
            id="sms-sender"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="11480"
            maxLength={20}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sms-message">Mensagem após pagamento aprovado</Label>
          <Textarea
            id="sms-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Olá {nome}, recebemos o seu pagamento de {valor} MT referente a {produto}."
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMessage((m) => `${m}${v}`)}
                className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent"
              >
                {v}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            As variáveis serão substituídas pelos dados reais da venda.
          </p>
        </div>

        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full sm:w-auto"
        >
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
            Envie uma mensagem real para validar a integração.
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
