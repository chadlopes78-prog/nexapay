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
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@paymentblack.com";

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

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No subscriptions found for user ${user_id}`);
      return new Response(JSON.stringify({ success: true, message: "No subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
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
          title,
          body,
          url,
        });

        await webpush.sendNotification(pushSubscription, payload);
        return { success: true, endpoint: sub.endpoint };
      } catch (err) {
        console.error(`Error sending push to ${sub.endpoint}:`, err);
        
        // If subscription is expired or invalid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseClient
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
          console.log(`Removed invalid subscription: ${sub.id}`);
        }
        
        return { success: false, endpoint: sub.endpoint, error: err.message };
      }
    });

    const results = await Promise.all(notifications);

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
