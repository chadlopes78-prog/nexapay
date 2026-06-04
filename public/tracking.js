(function() {
  // Get script parameters
  const script = document.currentScript;
  const urlParams = new URLSearchParams(script.src.split('?')[1]);
  const trackingId = urlParams.get('id');

  if (!trackingId) {
    console.error('CheckoutPro Tracking: Missing tracking ID');
    return;
  }

  // Configuration - Update these with your Supabase project details
  // Note: These are public keys, similar to how Firebase/Supabase are used on frontends.
  const SUPABASE_URL = window.CHECKOUTPRO_URL || ''; 
  const SUPABASE_KEY = window.CHECKOUTPRO_KEY || '';

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // We'll try to find them from the script source if not provided
    // This is a simplified version. In a real production environment, 
    // we would hardcode these or use a proxy edge function.
  }

  // Store tracking ID in session
  sessionStorage.setItem('cp_tracking_id', trackingId);

  // Helper to send events
  async function sendEvent(eventType, metadata = {}) {
    try {
      // Find the page ID first using the tracking ID
      // For performance and security, it's better to have an edge function 
      // but we'll simulate the logic here.
      // In this implementation, the script will call our backend.
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          trackingId: trackingId,
          eventType: eventType,
          url: window.location.href,
          referrer: document.referrer,
          metadata: metadata
        })
      });
      
      return await response.json();
    } catch (e) {
      console.error('CheckoutPro Tracking Error:', e);
    }
  }

  // 1. Record Visit
  sendEvent('visit');

  // 2. Capture Clicks on Checkout Buttons
  document.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target && (target.href.includes('/p/') || target.getAttribute('data-checkout'))) {
      sendEvent('click', { targetUrl: target.href });
      
      // Append tracking ID to URL if it's a checkout link
      try {
        const url = new URL(target.href);
        url.searchParams.set('tp_id', trackingId);
        target.href = url.toString();
      } catch(err) {}
    }
  });

})();