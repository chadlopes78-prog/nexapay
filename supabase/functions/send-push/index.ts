import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import webpush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Get VAPID keys from environment variables
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "https://paymentblack.com";

    if (!publicKey || !privateKey) {
      throw new Error("VAPID keys not configured");
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    // Fetch subscriptions for the user
    const { data: subscriptions, error: subError } = await supabaseClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (subError) throw subError;

    // Log the notification attempt
    const { data: logEntry, error: logError } = await supabaseClient
      .from("notifications_log")
      .insert({
        user_id,
        title,
        body,
        type: "push",
        metadata: { url, attempts: 1 }
      })
      .select()
      .single();

    if (logError) console.error("Error logging notification:", logError);

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No subscriptions found for user ${user_id}`);
      return new Response(JSON.stringify({ success: true, message: "No subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Pushcut iPhone notification (if user has configured)
    try {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("pushcut_url")
        .eq("id", user_id)
        .single();

      if (profile?.pushcut_url) {
        const pushcutRes = await fetch(profile.pushcut_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title || "💰 Pagamento Recebido!",
            text: body || "Uma nova venda foi confirmada.",
          }),
        });
        console.log(`Pushcut notification sent: ${pushcutRes.status}`);
      }
    } catch (pushcutErr) {
      console.error("Pushcut notification error:", pushcutErr);
    }

    const notifications = subscriptions.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        const payload = JSON.stringify({
          title: title || "💰 Pagamento Recebido!",
          body: body || "Uma nova venda foi confirmada no seu checkout.",
          url: url || "/dashboard",
          badge: "/logo-192.png",
          icon: "/logo-192.png",
          timestamp: Date.now()
        });

        // Use webpush for all as it is the standard supported by iOS 16.4+
        // and modern Android/Desktop browsers.
        await webpush.sendNotification(pushSubscription, payload);
        return { success: true, endpoint: sub.endpoint };
      } catch (err) {
        console.error(`Error sending push to ${sub.endpoint}:`, err);
        
        // Handle failed attempts with forward compatibility (retry/cleanup)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseClient
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
          console.log(`Removed invalid/expired subscription: ${sub.id}`);
        }
        
        return { success: false, endpoint: sub.endpoint, error: err.message, statusCode: err.statusCode };
      }
    });

    const results = await Promise.all(notifications);
    
    // Update log with results
    if (logEntry) {
      await supabaseClient
        .from("notifications_log")
        .update({
          metadata: { 
            url, 
            results,
            sent_at: new Date().toISOString()
          }
        })
        .eq("id", logEntry.id);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in send-push function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
