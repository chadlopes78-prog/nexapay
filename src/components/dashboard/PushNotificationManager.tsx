import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, BellOff, Info, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { subscribeToPushNotifications, unsubscribeFromPushNotifications } from "@/lib/push-notifications";

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setIsSupported(false);
      return;
    }

    setPermission(Notification.permission);
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Erro ao verificar inscrição:", error);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await subscribeToPushNotifications();
      setIsSubscribed(true);
      setPermission("granted");
      toast.success("Notificações ativadas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao assinar:", error);
      toast.error(error.message || "Erro ao ativar notificações");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      await unsubscribeFromPushNotifications();
      setIsSubscribed(false);
      toast.info("Notificações desativadas");
    } catch (error) {
      toast.error("Erro ao desativar notificações");
    } finally {
      setLoading(false);
    }
  };

  const testNotification = () => {
    // Show toast
    toast.success(
      <div className="flex flex-col gap-0.5">
        <span className="font-bold text-sm">Nova venda:</span>
        <span className="text-base">Pingou🎉 +350 MT</span>
      </div>,
      {
        icon: <div className="bg-green-100 p-1 rounded-full"><CreditCard className="h-4 w-4 text-green-600" /></div>,
        duration: 5000,
      }
    );

    // Show native if possible
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Nova venda:", {
        body: `Pingou🎉 +350 MT`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
      });
    }
  };

  if (!isSupported) {
    return (
      <Alert variant="destructive">
        <Info className="h-4 w-4" />
        <AlertTitle>Não suportado</AlertTitle>
        <AlertDescription>
          Seu navegador não suporta notificações push. No iOS, certifique-se de adicionar o app à tela inicial.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-none shadow-md bg-white dark:bg-slate-900">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              Notificações PaymentBlack
              {isSubscribed ? (
                <span className="flex h-2 w-2 rounded-full bg-green-500" />
              ) : (
                <span className="flex h-2 w-2 rounded-full bg-slate-300" />
              )}
            </CardTitle>
            <CardDescription>
              Receba alertas de vendas em tempo real e relatórios diários.
            </CardDescription>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {isSubscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {permission === "denied" && (
          <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30">
            <Info className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800 dark:text-red-400">Permissão Negada</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-500 text-xs">
              Você bloqueou as notificações. Por favor, reative nas configurações do seu navegador para receber alertas.
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
            Configurações de Alerta
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Notificações de Venda</span>
              <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">ATIVO</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Relatório Diário (20h)</span>
              <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">ATIVO</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Motivação Matinal</span>
              <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">ATIVO</span>
            </div>
          </div>
        </div>

        {isSubscribed ? (
          <Button 
            variant="outline" 
            className="w-full gap-2 border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700" 
            onClick={handleUnsubscribe}
            disabled={loading}
          >
            <BellOff className="h-4 w-4" />
            Desativar Notificações
          </Button>
        ) : (
          <Button 
            className="w-full gap-2 shadow-lg shadow-primary/20" 
            onClick={handleSubscribe}
            disabled={loading || permission === "denied"}
          >
            <Bell className="h-4 w-4" />
            Ativar Notificações Inteligentes
          </Button>
        )}

        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-[10px] text-slate-400 hover:text-primary"
          onClick={testNotification}
        >
          Enviar Notificação de Teste
        </Button>

        <div className="text-[10px] text-center text-slate-400">
          Compatível com iOS (Safari PWA) e Android.
        </div>
      </CardContent>
    </Card>
  );
}