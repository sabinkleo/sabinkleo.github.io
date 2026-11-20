(() => {
  'use strict';
  const tags = window.vlRevenueCampaign(location.search);
  if (!tags) return;

  for (const link of document.querySelectorAll('main a[href="/raio-x-vendas/"], main a[href^="https://wa.me/"]')) {
    const destination = new URL(link.href);
    if (destination.origin === location.origin) {
      for (const [name, value] of Object.entries(tags)) {
        destination.searchParams.set(name, value);
      }
    } else {
      const text = destination.searchParams.get('text') || '';
      destination.searchParams.set('text', text + '\nOrigem da campanha: ' + tags.utm_source + ' / ' + tags.utm_campaign);
    }
    link.href = destination.href;
  }
})();
