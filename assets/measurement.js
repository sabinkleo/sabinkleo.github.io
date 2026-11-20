/* Vértice Labs — mensuração sob consentimento (GTM). Sem dependências.
 * Não habilitar sem revisar as tags do contêiner e a política de privacidade.
 * O GTM é carregado somente após consentimento explícito (modo básico).
 */
(function () {
  'use strict';

  // Colar aqui o ID real do contêiner Web após configurá-lo em tagmanager.google.com.
  // IDs de Pixel, Google Ads e GA4 ficam somente no GTM — nunca duplicar bibliotecas.
  var GTM_ID = '';
  var allowed = ['/','/solucoes/','/raio-x-vendas/','/tuning/'];
  var path = location.pathname.replace(/\/index\.html$/, '/');
  if (path !== '/' && !path.endsWith('/')) path += '/';
  if (allowed.indexOf(path) === -1 || !/^GTM-[A-Z0-9]+$/.test(GTM_ID)) return;

  var STORAGE_KEY = 'vertice_measurement_consent_v1';
  var choice = null;
  var loaded = false;
  var viewed = false;
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'accepted' || stored === 'rejected') choice = stored;
  } catch (_) { /* Sem armazenamento, solicitar consentimento a cada visita. */ }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  function flags(granted) {
    var status = granted ? 'granted' : 'denied';
    return {
      analytics_storage: status,
      ad_storage: status,
      ad_user_data: status,
      ad_personalization: status
    };
  }
  gtag('consent', 'default', flags(false));
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
    // Somente eventos categóricos; não incluir números do diagnóstico, UTM bruta,
    // parâmetros de URL, telefone, nome, mensagens ou qualquer dado de formulário.
    if (choice !== 'accepted') return;
    window.dataLayer.push(Object.assign({ event: eventName, route: path }, fields || {}));
  }

  function measurePage() {
    if (viewed || choice !== 'accepted') return;
    viewed = true;
    track('vl_page_view', {});
  }

  function applyConsent(next) {
    var previouslyAccepted = choice === 'accepted';
    choice = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    gtag('consent', 'update', flags(next === 'accepted'));
    if (next === 'accepted') {
      loadGtm();
      measurePage();
    }
    if (next === 'rejected' && previouslyAccepted) {
      // Recarregar para evitar manter scripts de marketing carregados na sessão.
      location.reload();
    }
  }

  // Eventos sem texto livre, valores financeiros ou PII.
  document.addEventListener('click', function (event) {
    if (choice !== 'accepted') return;
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
      track('vl_contact_intent', { channel: 'whatsapp', cta: target.id || 'link' });
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
  function button(label, handler, secondary) {
    var el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    style(el, {
      font: '600 13px system-ui,sans-serif',
      padding: '10px 14px', cursor: 'pointer',
      borderRadius: '5px', border: '1px solid #d3fa43',
      color: secondary ? '#d3fa43' : '#090a09',
      background: secondary ? '#131713' : '#d3fa43',
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
      padding: '16px 18px', font: '14px/1.55 system-ui,sans-serif'
    });
    var heading = document.createElement('strong');
    heading.textContent = 'Privacidade e métricas da Vértice';
    var description = document.createElement('p');
    description.textContent = 'Com sua permissão, usamos métricas de navegação e anúncios para entender visitas e cliques. Nenhum texto digitado nas ferramentas é enviado por nossos eventos de medição.';
    description.style.margin = '7px 0';
    var details = document.createElement('a');
    details.href = '/politica-de-privacidade/';
    details.textContent = 'Saiba quais dados são medidos';
    details.style.color = '#d3fa43';
    var actions = document.createElement('div');
    style(actions, { display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '12px' });
    function finish(next) {
      applyConsent(next);
      panel.remove();
      settings.hidden = false;
    }
    actions.appendChild(button('Rejeitar', function () { finish('rejected'); }, true));
    actions.appendChild(button('Aceitar métricas e anúncios', function () { finish('accepted'); }, false));
    panel.appendChild(heading);
    panel.appendChild(description);
    panel.appendChild(details);
    panel.appendChild(actions);
    return panel;
  }

  var settings = button('Privacidade', function () {
    settings.hidden = true;
    document.body.appendChild(makePanel());
  }, true);
  settings.setAttribute('aria-label', 'Revisar consentimento de métricas e anúncios');
  style(settings, {
    position: 'fixed', zIndex: '2147482999',
    bottom: '10px', left: '10px', opacity: '0.94'
  });
  settings.hidden = !choice;

  function initialize() {
    document.body.appendChild(settings);
    if (choice === 'accepted') {
      gtag('consent', 'update', flags(true));
      loadGtm();
      measurePage();
    } else if (!choice) {
      document.body.appendChild(makePanel());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
