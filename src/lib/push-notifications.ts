import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY = "BETEoVdcIuhkKSgg8hOo_FMhcFPODIRW7prsctLKBjrCHHyUX3Vies5BrclXrsifs4H3-lRtJV1uBQ-HiXv4bVc";

export async function subscribeToPushNotifications(silent = false) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (!silent) console.warn("Push notifications are not supported in this browser.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check permission first
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    
    if (permission !== "granted") {
      if (!silent) console.warn("Permission not granted for notifications.");
      return;
    }

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    // Save to database
    const p256dh = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey("p256dh")!))));
    const auth = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey("auth")!))));

    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: session.user.id,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
    }, {
      onConflict: 'user_id,endpoint'
    });

    if (error) {
      console.error("Error saving push subscription:", error);
      if (!silent) throw error;
    }

    return subscription;
  } catch (error) {
    if (!silent) {
      console.error("Push subscription error:", error);
      throw error;
    }
  }
}

export async function unsubscribeFromPushNotifications() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  
  if (subscription) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", subscription.endpoint);
    }
    await subscription.unsubscribe();
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
