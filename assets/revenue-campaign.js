(function () {
  'use strict';

  // Attribution in a voluntary contact draft accepts only the published pilot links.
  const campaign = 'revenue-os-piloto-cwb';
  const sources = { linkedin: 'organic_social', indicacao: 'referral', whatsapp: 'outreach' };
  const keys = ['utm_source', 'utm_medium', 'utm_campaign'];

  window.vlRevenueCampaign = function (search) {
    const params = new URLSearchParams(search);
    if (keys.some(key => params.getAll(key).length !== 1)) return null;
    const source = params.get('utm_source');
    const medium = params.get('utm_medium');
    if (params.get('utm_campaign') !== campaign ||
        !Object.hasOwn(sources, source) || sources[source] !== medium) return null;
    return { utm_source: source, utm_medium: medium, utm_campaign: campaign };
  };
})();
