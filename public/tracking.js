(function() {
  // Get script parameters
  const script = document.currentScript;
  if (!script) return;

  const urlParams = new URLSearchParams(script.src.split('?')[1]);
  const trackingId = urlParams.get('id');

  if (!trackingId) {
    console.error('CheckoutPro Tracking: Missing tracking ID');
    return;
  }

  // Configuration
  const scriptUrl = new URL(script.src);
  const BASE_URL = scriptUrl.origin;
  
  // Helper to send events
  async function sendEvent(eventType, metadata = {}) {
    try {
      const response = await fetch(`${BASE_URL}/functions/v1/track-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      // Silently fail in production
    }
  }

  // 1. Record Visit
  sendEvent('visit');

  // 2. Capture Clicks on Checkout Buttons
  document.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target) {
      const isCheckoutLink = target.href.includes('/p/') || target.getAttribute('data-checkout');
      
      if (isCheckoutLink) {
        sendEvent('click', { targetUrl: target.href });
        
        // Append tracking ID to URL if it's a checkout link
        try {
          const url = new URL(target.href);
          url.searchParams.set('tp_id', trackingId);
          target.href = url.toString();
        } catch(err) {}
      }
    }
  });

})();