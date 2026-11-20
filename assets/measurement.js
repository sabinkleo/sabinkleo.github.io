(function () {
  'use strict';

  var GTM_ID = 'GTM-MPTCNSL9';
  var allowed = ['/','/solucoes/','/raio-x-vendas/','/tuning/'];
  var path = location.pathname.replace(/\/index\.html$/, '/');
  if (path !== '/' && !path.endsWith('/')) path += '/';
  if (!allowed.includes(path)) return;

  var STORAGE_KEY = 'vertice_measurement_consent_v2';
  var choice = readChoice();
  var loaded = false;
  // Ignore arbitrary URL values. The numeric Tag Assistant flag is safe for Preview.
  var safeUrl = !location.hash && (!location.search || /^\?gtm_debug=\d+$/.test(location.search));
  var adPage = path === '/' || path === '/solucoes/';
  var safeReferrer = !document.referrer || /^https?:\/\/[^/?#]+\/$/.test(document.referrer);

  function readChoice() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (['none', 'analytics', 'ads', 'both'].includes(stored)) return stored;
    } catch (_) { /* Sem armazenamento, pedir a escolha na próxima visita. */ }
    return null;
  }

  function analyticsEnabled() {
    return safeUrl && (choice === 'analytics' || choice === 'both');
  }

  function adsEnabled() {
    return safeUrl && safeReferrer && adPage && (choice === 'ads' || choice === 'both');
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
    if (loaded) return;
    loaded = true;
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
    document.head.appendChild(script);
  }

  function track(eventName, fields) {
    if (!analyticsEnabled()) return;
    window.dataLayer.push(Object.assign({ event: eventName, route: path }, fields));
  }

  function startMeasurement() {
    if (loaded || (!analyticsEnabled() && !adsEnabled())) return;
    gtag('consent', 'update', flags(analyticsEnabled(), adsEnabled()));
    loadGtm();
    track('vl_page_view', { page_location: location.origin + path });
    if (adsEnabled()) window.dataLayer.push({ event: 'vl_ads_page_view', route: path });
  }

  function applyConsent(next, persist) {
    if (choice === next) return;
    choice = next;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* Choice applies to this document. */ }
    }
    if (loaded) {
      gtag('consent', 'update', flags(false, false));
      location.reload();
      return;
    }
    startMeasurement();
  }

  function syncChoice() {
    var stored = readChoice();
    applyConsent(stored, false);
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

  function style(element, declarations) {
    Object.assign(element.style, declarations);
    return element;
  }
  function button(label, handler) {
    var el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    style(el, {
      font: '600 13px system-ui,sans-serif',
      padding: '10px 14px', cursor: 'pointer',
      borderRadius: '5px', border: '1px solid #d3fa43',
      color: '#d3fa43',
      background: '#131713',
      minHeight: '42px'
    });
    el.addEventListener('click', handler);
    return el;
  }
  function makePanel() {
    var panel = document.createElement('section');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Preferências de privacidade');
    style(panel, {
      position: 'fixed', zIndex: '2147483000',
      bottom: '12px', left: '12px', right: '12px', maxWidth: '660px',
      margin: '0 auto', background: '#121812', color: '#f1f2e9',
      border: '1px solid #6a8a39', borderRadius: '9px',
      boxShadow: '0 10px 42px #000a',
      padding: '16px 18px', maxHeight: 'calc(100dvh - 24px)', overflow: 'auto', font: '14px/1.55 system-ui,sans-serif'
    });
    var heading = document.createElement('strong');
    heading.textContent = 'Privacidade e métricas da Vértice';
    var description = document.createElement('p');
    description.textContent = 'Escolha se deseja permitir estatísticas de uso (Google Analytics) e medição de publicidade (Meta). As ferramentas funcionam com ambas desligadas.';
    description.style.margin = '7px 0';
    var details = document.createElement('a');
    details.href = '/politica-de-privacidade/';
    details.textContent = 'Saiba quais dados são medidos';
    details.style.color = '#d3fa43';
    var actions = document.createElement('div');
    style(actions, { display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '12px' });
    function option(label, checked) {
      var wrapper = document.createElement('label');
      wrapper.style.display = 'block';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      wrapper.append(input, ' ' + label);
      panel.appendChild(wrapper);
      return input;
    }

    function finish(next) {
      applyConsent(next, true);
      panel.remove();
      settings.hidden = false;
      settings.focus();
    }
    panel.appendChild(heading);
    panel.appendChild(description);
    panel.appendChild(details);
    var analytics = option('Estatísticas de uso', choice === 'analytics' || choice === 'both');
    var ads = option('Medição de publicidade', choice === 'ads' || choice === 'both');
    actions.appendChild(button('Rejeitar opcionais', function () { finish('none'); }));
    actions.appendChild(button('Salvar escolhas', function () {
      finish(analytics.checked ? (ads.checked ? 'both' : 'analytics') : (ads.checked ? 'ads' : 'none'));
    }));
    actions.appendChild(button('Aceitar opcionais', function () { finish('both'); }));
    panel.appendChild(actions);
    return panel;
  }

  var settings = button('Privacidade', function () {
    settings.hidden = true;
    document.body.appendChild(makePanel());
  });
  settings.setAttribute('aria-label', 'Revisar consentimento de métricas e anúncios');
  style(settings, {
    position: 'fixed', zIndex: '2147482999',
    bottom: '10px', left: '10px', opacity: '0.94'
  });
  settings.hidden = !choice;

  function initialize() {
    document.body.appendChild(settings);
    if (!choice) document.body.appendChild(makePanel());
    startMeasurement();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
