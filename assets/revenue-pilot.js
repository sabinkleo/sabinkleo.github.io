(() => {
  'use strict';
  // Only known campaign labels travel to the voluntary WhatsApp draft.
  const campaign = 'revenue-os-piloto-cwb';
  const sources = { linkedin: 'organic_social', indicacao: 'referral', whatsapp: 'outreach' };
  const incoming = new URLSearchParams(location.search);
  const source = incoming.get('utm_source');
  const medium = incoming.get('utm_medium');
  if (incoming.get('utm_campaign') !== campaign ||
      !Object.hasOwn(sources, source) || sources[source] !== medium) return;

  for (const link of document.querySelectorAll('main a[href="/raio-x-vendas/"], main a[href^="https://wa.me/"]')) {
    const destination = new URL(link.href);
    if (destination.origin === location.origin) {
      for (const [name, value] of Object.entries({ utm_source: source, utm_medium: medium, utm_campaign: campaign })) {
        destination.searchParams.set(name, value);
      }
    } else {
      const text = destination.searchParams.get('text') || '';
      destination.searchParams.set('text', text + '\nOrigem da campanha: ' + source + ' / ' + campaign);
    }
    link.href = destination.href;
  }
})();
