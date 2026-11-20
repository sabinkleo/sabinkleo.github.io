(function () {
  'use strict';

  var GTM_ID = 'GTM-MPTCNSL9';
  var allowed = ['/','/solucoes/','/raio-x-vendas/','/tuning/'];
  var path = location.pathname.replace(/\/index\.html$/, '/');
  if (path !== '/' && !path.endsWith('/')) path += '/';
  if (!allowed.includes(path)) return;

  var STORAGE_KEY = 'vertice_measurement_consent_v2';
  var choices = ['none', 'analytics', 'ads', 'both'];
  var choice = readChoice();
  var script;
  var adPage = path === '/' || path === '/solucoes/';

  // Only registered tags can leave the browser. A slug regex also accepts names and phone numbers.
  var campaignValues = {
    utm_source: ['linkedin', 'indicacao', 'whatsapp', 'google', 'instagram', 'facebook'],
    utm_medium: ['organic_social', 'referral', 'outreach', 'cpc', 'paid_social'],
    utm_campaign: ['revenue-os-piloto-cwb']
  };

  function cleanLocation() {
    var incoming = new URL(location.href);
    var clean = new URL(path, location.origin);
    Object.keys(campaignValues).forEach(function (key) {
      var values = incoming.searchParams.getAll(key);
      if (values.length === 1 && campaignValues[key].includes(values[0])) {
        clean.searchParams.set(key, values[0]);
      }
    });
    return clean.href;
  }

  function cleanReferrer() {
    if (!document.referrer) return '';
    var from = new URL(document.referrer);
    if (from.origin === location.origin && allowed.includes(from.pathname)) return from.origin + '/';
    var knownOrigins = ['https://www.google.com', 'https://www.google.com.br', 'https://www.linkedin.com',
      'https://l.facebook.com', 'https://www.facebook.com', 'https://l.instagram.com', 'https://www.instagram.com'];
    return knownOrigins.includes(from.origin) ? from.origin + '/' : '';
  }

  function savedChoice() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (choices.includes(stored)) return stored;
    } catch (_) { /* Storage can be unavailable. */ }
    return null;
  }

  function readChoice() {
    var entry = history.state?.[STORAGE_KEY];
    return choices.includes(entry) ? entry : savedChoice();
  }

  function analyticsEnabled() {
    return choice === 'analytics' || choice === 'both';
  }

  function adsEnabled() {
    return adPage && (choice === 'ads' || choice === 'both');
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  function flags(analytics, ads) {
    return {
      analytics_storage: analytics ? 'granted' : 'denied',
      ad_storage: ads ? 'granted' : 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    };
  }
  gtag('consent', 'default', flags(false, false));
  gtag('set', 'ads_data_redaction', true);

  function loadGtm() {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
    document.head.appendChild(script);
  }

  function track(eventName, fields) {
    if (!script || !analyticsEnabled()) return;
    window.dataLayer.push(Object.assign({ event: eventName, route: path }, fields));
  }

  function startMeasurement() {
    if (script || (!analyticsEnabled() && !adsEnabled())) return;
    var pageLocation = cleanLocation();
    var pageReferrer = cleanReferrer();
    // The container and vendor scripts can also read the raw browser fields. A
    // fresh document without a referrer is required for detailed/unknown URLs.
    if (document.referrer && document.referrer !== pageReferrer) {
      if (savedChoice() !== choice) return;
      var navigation = document.createElement('a');
      navigation.href = pageLocation;
      navigation.rel = 'noreferrer';
      navigation.click();
      return;
    }
    try {
      if (location.href !== pageLocation) history.replaceState(history.state, '', pageLocation);
    } catch (_) { return; } // Keep the container blocked if the raw URL is still present.

    gtag('set', { page_location: pageLocation, page_referrer: pageReferrer });
    gtag('consent', 'update', flags(analyticsEnabled(), adsEnabled()));
    loadGtm();
    track('vl_page_view', { page_location: pageLocation, page_referrer: pageReferrer });
    if (adsEnabled()) window.dataLayer.push({ event: 'vl_ads_page_view', route: path });
  }

  function persistChoice(next) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
      if (!history.state?.[STORAGE_KEY]) return;
    } catch (_) { /* Use this history entry if local storage fails. */ }
    var state = Object.assign({}, history.state);
    if (savedChoice() === next) delete state[STORAGE_KEY];
    else state[STORAGE_KEY] = next;
    history.replaceState(state, '');
  }

  function applyConsent(next, persist) {
    if (persist) persistChoice(next);
    if (choice === next) return;
    choice = next;
    if (script) {
      script.remove();
      gtag('consent', 'update', flags(false, false));
      location.reload();
      return;
    }
    startMeasurement();
  }

  function syncChoice() {
    applyConsent(readChoice(), false);
    if (consentUi) consentUi();
  }
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY || event.key === null) syncChoice();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) syncChoice();
  });

  // Eventos sem texto livre, valores financeiros ou PII.
  document.addEventListener('click', function (event) {
    if (!analyticsEnabled() || !(event.target instanceof Element)) return;
    var target = event.target.closest('a,button');
    if (!target) return;
    var isWhatsApp = target.id === 'btnWhatsapp' || target.id === 'whats';
    if (target.tagName === 'A') {
      try {
        var href = new URL(target.href, location.origin);
        isWhatsApp = isWhatsApp || (href.protocol === 'https:' &&
          (href.hostname === 'wa.me' || href.hostname === 'api.whatsapp.com'));
        if (href.origin === location.origin &&
            (href.pathname === '/solucoes/' || href.pathname === '/raio-x-vendas/')) {
          track('vl_funnel_navigation', { destination: href.pathname });
        }
      } catch (_) { /* URL inválida não deve interromper a navegação. */ }
    }
    if (isWhatsApp) {
      track('vl_contact_intent', { channel: 'whatsapp', cta: target.id === 'btnWhatsapp' || target.id === 'whats' ? target.id : 'link' });
    } else if (target.id === 'btnAnalyze' && path === '/tuning/') {
      track('vl_tool_interaction', { tool: 'pre_dyno', action: 'manual_analysis' });
    } else if (target.id === 'copy' && path === '/raio-x-vendas/') {
      track('vl_tool_interaction', { tool: 'sales_diagnostic', action: 'copy_summary' });
    } else if (target.id === 'btnCopy' && path === '/tuning/') {
      track('vl_tool_interaction', { tool: 'pre_dyno', action: 'copy_summary' });
    }
  }, true);

  var consentUi;

  function initialize() {
    var controls = document.createElement('div');
    controls.className = 'vl-consent';
    controls.innerHTML = `
      <section class="vl-consent-card" aria-labelledby="vl-cookie-title" hidden>
        <h2 id="vl-cookie-title">Sua privacidade importa</h2>
        <p>Usamos cookies opcionais para analisar o uso das ferramentas e medir campanhas. Você pode aceitar, recusar ou personalizar suas escolhas.</p>
        <div class="vl-consent-actions">
          <button type="button" data-choice="both">Aceitar todos</button>
          <button type="button" data-choice="none">Recusar opcionais</button>
          <button type="button" data-open>Personalizar</button>
        </div>
        <a href="/politica-de-privacidade/">Política de privacidade</a>
      </section>
      <button class="vl-consent-settings" type="button" data-open hidden>Preferências de cookies</button>
      <dialog class="vl-consent-card" aria-labelledby="vl-cookie-settings">
        <div class="vl-consent-heading">
          <h2 id="vl-cookie-settings" tabindex="-1">Preferências de cookies</h2>
          <button type="button" data-close aria-label="Fechar preferências">×</button>
        </div>
        <div class="vl-consent-option">
          <span><strong>Essenciais</strong><small>Guardam sua escolha de privacidade.</small></span>
          <span>Sempre ativos</span>
        </div>
        <label class="vl-consent-option">
          <span><strong>Analytics</strong><small>Mede o uso das páginas e ferramentas.</small></span>
          <input type="checkbox" name="analytics" aria-label="Analytics">
        </label>
        <label class="vl-consent-option">
          <span><strong>Publicidade</strong><small>Mede campanhas na página inicial e em Soluções.</small></span>
          <input type="checkbox" name="ads" aria-label="Publicidade">
        </label>
        <div class="vl-consent-actions">
          <button type="button" data-choice="both">Aceitar todos</button>
          <button type="button" data-choice="none">Recusar opcionais</button>
          <button type="button" data-choice="save">Salvar escolhas</button>
        </div>
      </dialog>`;
    var banner = controls.querySelector('section');
    var settings = controls.querySelector('.vl-consent-settings');
    var dialog = controls.querySelector('dialog');
    var analytics = dialog.querySelector('[name="analytics"]');
    var ads = dialog.querySelector('[name="ads"]');
    var opener;

    consentUi = function () {
      var container = choice ? document.querySelector('footer') || document.body : document.body;
      if (controls.parentNode !== container) container.appendChild(controls);
      banner.hidden = choice !== null;
      settings.hidden = choice === null;
      analytics.checked = analyticsEnabled();
      ads.checked = choice === 'ads' || choice === 'both';
    };
    consentUi();

    controls.querySelectorAll('[data-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        opener = button;
        consentUi();
        dialog.showModal();
        dialog.querySelector('h2').focus();
      });
    });
    dialog.querySelector('[data-close]').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () {
      if (opener && opener.getClientRects().length) opener.focus();
      else if (!settings.hidden) settings.focus();
    });
    controls.querySelectorAll('[data-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = button.dataset.choice;
        if (next === 'save') {
          next = analytics.checked ? (ads.checked ? 'both' : 'analytics') : (ads.checked ? 'ads' : 'none');
        }
        applyConsent(next, true);
        consentUi();
        if (dialog.open) dialog.close();
        settings.focus({ preventScroll: true });
      });
    });
    startMeasurement();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
