import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_EVENTS = {
  sale_approved: true,
  sale_refused: true,
  payment_pending: true,
  payment_processing: true,
  refund: true,
  checkout_abandoned: true,
  daily_summary: true,
};

function isValidHttpsUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export const getPushcutIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("pushcut_integrations")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const savePushcutIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    url: string;
    active?: boolean;
    events?: Record<string, boolean>;
    daily_summary_time?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const url = String(data.url || "").trim();
    if (!isValidHttpsUrl(url)) throw new Error("URL inválida (use https://...)");
    const payload = {
      user_id: context.userId,
      url,
      active: data.active ?? true,
      events: { ...DEFAULT_EVENTS, ...(data.events ?? {}) },
      daily_summary_time: data.daily_summary_time ?? "20:00",
    };
    const { data: saved, error } = await context.supabase
      .from("pushcut_integrations")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deletePushcutIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("pushcut_integrations")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testPushcutIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: integ, error } = await context.supabase
      .from("pushcut_integrations")
      .select("url")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!integ) throw new Error("Configure a URL do Pushcut antes de testar.");

    const started = Date.now();
    let status: number | null = null;
    let bodyText = "";
    let errorMsg: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const resp = await fetch(integ.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Teste Pushcut 🚀",
          text: "Se recebeu esta notificação, a integração está a funcionar!",
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      status = resp.status;
      bodyText = (await resp.text().catch(() => "")).slice(0, 500);
      if (!resp.ok) errorMsg = `HTTP ${resp.status}`;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    const elapsedMs = Date.now() - started;

    // Log
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pushcut_logs").insert({
      order_id: `test:${context.userId}:${Date.now()}`,
      user_id: context.userId,
      status: !errorMsg ? "sent" : "failed",
      sent_at: !errorMsg ? new Date().toISOString() : null,
      metadata: {
        source: "pushcut_service",
        event: "test",
        url: integ.url,
        response_code: status,
        response_body: bodyText,
        error: errorMsg,
        elapsed_ms: elapsedMs,
      },
    });

    if (errorMsg) throw new Error(`${errorMsg}${bodyText ? ` — ${bodyText}` : ""}`);
    return { ok: true, status, elapsedMs };
  });
