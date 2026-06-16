import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import webpush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pushcut sender with retry + timeout (resilient, low-latency)
async function sendPushcut(
  url: string,
  payload: { title: string; text: string; input?: string },
  opts: { maxAttempts?: number; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status?: number; attempts: number; error?: string }> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 4000;
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;
      // Pushcut returns 2xx on success. 4xx (except 429) is non-retryable.
      if (res.ok) return { ok: true, status: res.status, attempts: attempt };
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const text = await res.text().catch(() => "");
        return { ok: false, status: res.status, attempts: attempt, error: text || `HTTP ${res.status}` };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      clearTimeout(timer);
      lastError = (err as Error)?.message || String(err);
    }
    // Exponential backoff before next attempt: 200ms, 600ms
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 200 * Math.pow(3, attempt - 1)));
    }
  }
  return { ok: false, status: lastStatus, attempts: maxAttempts, error: lastError };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { user_id, title, body, url = "/dashboard" } = await req.json();

    if (!user_id) {
      throw new Error("user_id is required");
    }

    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "https://paymentblack.com";

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    }

    // Fetch subscriptions and profile (for Pushcut URL) in parallel to cut latency
    const [subsRes, profileRes, logRes] = await Promise.all([
      supabaseClient.from("push_subscriptions").select("*").eq("user_id", user_id),
      supabaseClient.from("profiles").select("pushcut_url").eq("id", user_id).maybeSingle(),
      supabaseClient
        .from("notifications_log")
        .insert({
          user_id,
          title,
          body,
          type: "push",
          metadata: { url, attempts: 1 },
        })
        .select()
        .single(),
    ]);

    if (subsRes.error) throw subsRes.error;
    const subscriptions = subsRes.data ?? [];
    const pushcutUrl = profileRes.data?.pushcut_url as string | undefined;
    const logEntry = logRes.data;

    // Lightweight Pushcut payload — only essential data
    const pushcutPayload = {
      title: title || "💰 Pagamento Recebido!",
      text: body || "Uma nova venda foi confirmada.",
    };

    // Web push tasks
    const webPushTasks = subscriptions.map(async (sub) => {
      try {
        const payload = JSON.stringify({
          title: title || "💰 Pagamento Recebido!",
          body: body || "Uma nova venda foi confirmada no seu checkout.",
          url: url || "/dashboard",
          badge: "/logo-192.png",
          icon: "/logo-192.png",
          timestamp: Date.now(),
        });
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        return { success: true, endpoint: sub.endpoint };
      } catch (err: any) {
        console.error(`Web push error to ${sub.endpoint}:`, err?.message);
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabaseClient.from("push_subscriptions").delete().eq("id", sub.id);
        }
        return { success: false, endpoint: sub.endpoint, error: err?.message, statusCode: err?.statusCode };
      }
    });

    // Pushcut task (runs in parallel with web push)
    const pushcutTask = pushcutUrl
      ? sendPushcut(pushcutUrl, pushcutPayload)
      : Promise.resolve({ ok: false, attempts: 0, error: "no_pushcut_url" } as const);

    const [webResults, pushcutResult] = await Promise.all([
      Promise.all(webPushTasks),
      pushcutTask,
    ]);

    console.log(
      `Pushcut: ${pushcutResult.ok ? "OK" : "FAIL"} status=${pushcutResult.status ?? "-"} attempts=${pushcutResult.attempts}${pushcutResult.error ? ` err=${pushcutResult.error}` : ""}`,
    );

    if (logEntry) {
      await supabaseClient
        .from("notifications_log")
        .update({
          metadata: {
            url,
            results: webResults,
            pushcut: pushcutResult,
            sent_at: new Date().toISOString(),
          },
        })
        .eq("id", logEntry.id);
    }

    return new Response(
      JSON.stringify({ success: true, results: webResults, pushcut: pushcutResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("Error in send-push function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
