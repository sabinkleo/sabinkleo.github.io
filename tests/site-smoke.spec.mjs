import { test, expect } from '@playwright/test';

const origin = process.env.SITE_TEST_ORIGIN || 'http://127.0.0.1:8765';
const routes = [
  '/',
  '/klein/',
  '/horoscopo/',
  '/n1/',
  '/n1/equipe/',
  '/n1/etiquetas/',
  '/n1/visao/',
  '/n1/visao/fotos/',
  '/tuning/',
  '/raio-x-vendas/',
  '/privacy/',
  '/estudos/mecatronica/'
];

for (const route of routes) {
  test('HTML and main heading load: ' + route, async ({ page }) => {
    const exceptions = [];
    page.on('pageerror', error => exceptions.push(error.message));
    const response = await page.goto(origin + route, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    expect(exceptions, 'JavaScript errors on ' + route).toEqual([]);
  });
}

test('Home places Recursos e pesquisa first without losing commercial tools', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vertice_measurement_consent_v2', 'none'));
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/pt/catalogo/');
    const groups = page.locator('.vl-home .tool-group');
    await expect(groups).toHaveCount(4);
    await expect(groups.locator('h2')).toHaveText([
      'Recursos e pesquisa', 'Negócios e operação', 'Engenharia e estudos', 'Mercados'
    ]);
    await expect(groups.first().getByRole('link', { name: 'Abrir Vértice Drops' })).toBeVisible();
    await expect(groups.first().getByRole('link', { name: 'Abrir Observatório' })).toBeVisible();
    await expect(groups.first().getByRole('link', { name: 'Abrir Astro Lab' })).toBeVisible();
    await expect(groups.nth(1).getByRole('link', { name: 'Abrir Raio-X de Vendas' })).toBeVisible();
    await expect(groups.nth(1).getByRole('link', { name: 'Abrir Núcleo N1' })).toBeVisible();
    await expect(page.locator('.vl-home .card')).toHaveCount(11);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('Product visual layer is scoped, responsive and keeps the commercial links reachable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vertice_measurement_consent_v2', 'none'));
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/pt/catalogo/');
    await expect(page.locator('.vt-eyebrow')).toBeVisible();
    await expect(page.locator('link[href="/assets/terminal-design.css"]')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Abrir Raio-X de Vendas' })).toBeVisible();
    const homeStyles = await page.evaluate(() => ({
      grid: getComputedStyle(document.body).backgroundSize,
      cardRadius: getComputedStyle(document.querySelector('.vl-home .card')).borderRadius,
      headingFont: getComputedStyle(document.querySelector('.vl-home h1')).fontFamily,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(homeStyles.grid).toBe('auto');
    expect(homeStyles.cardRadius).toBe('16px');
    expect(homeStyles.headingFont).toContain('system-ui');
    expect(homeStyles.scrollWidth).toBeLessThanOrEqual(width);

    await page.goto(origin + '/solucoes/');
    await expect(page.locator('body')).toHaveClass(/vl-marketing/);
    await expect(page.getByRole('link', { name: 'Fazer diagnóstico gratuito' })).toBeVisible();
    const marketingStyles = await page.evaluate(() => ({
      cardRadius: getComputedStyle(document.querySelector('.pricing .box')).borderRadius,
      headingFont: getComputedStyle(document.querySelector('main h1')).fontFamily,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(marketingStyles.cardRadius).toBe('16px');
    expect(marketingStyles.headingFont).toContain('system-ui');
    expect(marketingStyles.scrollWidth).toBeLessThanOrEqual(width);
  }

  await page.goto(origin + '/observatorio/');
  await expect(page.locator('link[href="/assets/terminal-design.css"]')).toHaveCount(0);
  await expect(page.locator('h1')).toBeVisible();
});

test('Observatório on mobile keeps its archive usable and favorites persistent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/observatorio/');
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const search = page.locator('[name=busca]');
  await search.fill('zzzz-no-match');
  await expect(page.locator('#sem-resultados')).toBeVisible();
  await page.locator('#limpar').click();
  const card = page.locator('[data-card="frete-search-console"]');
  await expect(card).toBeVisible();
  await card.locator('[data-save]').click();
  await page.reload();
  await expect(card.locator('[data-save]')).toHaveAttribute('aria-pressed', 'true');
  await card.locator('h3 a').click();
  await expect(page.locator('h1')).toContainText('frete');
  await expect(page.locator('#fontes')).toBeVisible();
});

async function stubGtm(page) {
  const requests = [];
  await page.route('https://www.googletagmanager.com/**', async route => {
    requests.push(route.request().url());
    await route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  return requests;
}

const consentDialog = page => page.getByRole('dialog', { name: 'Preferências de cookies' });
const consentSettings = page => page.getByRole('button', { name: 'Preferências de cookies' });
const banner = page => page.getByRole('region', { name: 'Sua privacidade importa' });
const personalize = page => banner(page).getByRole('button', { name: 'Personalizar' });
const reject = scope => scope.getByRole('button', { name: 'Recusar opcionais' });
const accept = scope => scope.getByRole('button', { name: 'Aceitar todos' });
const save = page => consentDialog(page).getByRole('button', { name: 'Salvar escolhas' });
const siteEvents = page => page.evaluate(() => window.dataLayer.filter(item => item.event?.startsWith('vl_')));

test('GTM waits for consent, persists rejection and stops loading after revocation', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/solucoes/');
  const dialog = consentDialog(page);
  await expect(banner(page)).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  expect(requests).toEqual([]);
  await personalize(page).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Analytics')).not.toBeChecked();
  await expect(dialog.getByLabel('Publicidade')).not.toBeChecked();
  expect(await page.evaluate(() => Array.from(window.dataLayer[0]))).toEqual([
    'consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    }
  ]);
  await reject(dialog).click();
  await page.reload();
  await expect(dialog).toBeHidden();
  await expect(banner(page)).toBeHidden();
  expect(requests).toEqual([]);
  await consentSettings(page).click();
  await dialog.getByLabel('Analytics').check();
  await save(page).click();
  await expect.poll(() => requests).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-MPTCNSL9']);
  expect(await siteEvents(page)).toEqual([
    { event: 'vl_page_view', route: '/solucoes/', page_location: origin + '/solucoes/', page_referrer: '' }
  ]);
  await consentSettings(page).click();
  await Promise.all([page.waitForEvent('load'), reject(dialog).click()]);
  await expect(consentSettings(page)).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(await siteEvents(page)).toEqual([]);
});

test('Ads-only emits only the landing-page event and respects excluded routes', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.goto(origin + '/');
  const dialog = consentDialog(page);
  await personalize(page).click();
  await dialog.getByLabel('Publicidade').check();
  await save(page).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(await siteEvents(page)).toEqual([{ event: 'vl_ads_page_view', route: '/' }]);
  for (const route of ['/tuning/', '/raio-x-vendas/']) {
    await page.goto(origin + route);
    expect(await siteEvents(page)).toEqual([]);
    expect(requests).toHaveLength(1);
  }
  for (const route of ['/n1/', '/n1/equipe/', '/privacy/', '/politica-de-privacidade/', '/estudos/mecatronica/']) {
    await page.goto(origin + route);
    await expect(page.locator('script[src*="measurement.js"]')).toHaveCount(0);
    expect(requests).toHaveLength(1);
  }
});

test('tool events carry only fixed fields and keep the tool actions working', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.addInitScript(() => {
    localStorage.setItem('vertice_measurement_consent_v2', 'both');
    window.open = url => { window.openedForTest = url; };
  });
  await page.goto(origin + '/raio-x-vendas/');
  await page.locator('#ticket').fill('123456');
  await page.locator('#whats').click();
  expect(await page.evaluate(() => window.openedForTest)).toContain('https://wa.me/');
  expect(await siteEvents(page)).toEqual([
    { event: 'vl_page_view', route: '/raio-x-vendas/', page_location: origin + '/raio-x-vendas/', page_referrer: '' },
    { event: 'vl_contact_intent', route: '/raio-x-vendas/', channel: 'whatsapp', cta: 'whats' }
  ]);
  await page.goto(origin + '/tuning/');
  await page.locator('#btnAnalyze').click();
  expect(await siteEvents(page)).toEqual([
    { event: 'vl_page_view', route: '/tuning/', page_location: origin + '/tuning/', page_referrer: '' },
    { event: 'vl_tool_interaction', route: '/tuning/', tool: 'pre_dyno', action: 'manual_analysis' }
  ]);
  await expect.poll(() => requests.length).toBe(2);
});

test('Accept all starts a single container per document and category changes survive reload', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.goto(origin + '/solucoes/');
  await accept(banner(page)).click();
  await expect.poll(() => requests.length).toBe(1);
  expect((await siteEvents(page)).map(event => event.event)).toEqual(['vl_page_view', 'vl_ads_page_view']);
  await consentSettings(page).click();
  await expect(consentDialog(page).getByRole('checkbox', { name: 'Analytics' })).toBeChecked();
  await expect(consentDialog(page).getByRole('checkbox', { name: 'Publicidade' })).toBeChecked();
  await accept(consentDialog(page)).click();
  expect(requests).toHaveLength(1);
  await consentSettings(page).click();
  await consentDialog(page).getByRole('checkbox', { name: 'Publicidade' }).uncheck();
  await Promise.all([page.waitForEvent('load'), save(page).click()]);
  await expect.poll(() => requests.length).toBe(2);
  expect((await siteEvents(page)).map(event => event.event)).toEqual(['vl_page_view']);
  await page.reload();
  await expect.poll(() => requests.length).toBe(3);
  expect((await siteEvents(page)).map(event => event.event)).toEqual(['vl_page_view']);
  await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(1);
});

test('GTM executes with clean browser fields and a registered campaign after opt-in', async ({ page }) => {
  const requests = [];
  await page.route('https://www.googletagmanager.com/**', async route => {
    requests.push(route.request().headers());
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.tagInputs = { url: location.href, from: document.referrer, layer: dataLayer };'
    });
  });
  const clean = origin + '/solucoes/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=revenue-os-piloto-cwb';
  const dirty = clean + '&email=ficticio%40example.invalid&utm_content=texto-livre&gclid=opaque#segredo';
  await page.goto(dirty, { referer: origin + '/?token=sentinela' });
  await expect(page).toHaveURL(dirty);
  expect(requests).toEqual([]);
  await accept(banner(page)).click();
  await expect(page).toHaveURL(clean);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].referer).toBeUndefined();
  const inputs = await page.evaluate(() => window.tagInputs);
  expect(inputs.url).toBe(clean);
  expect(inputs.from).toBe('');
  expect(JSON.stringify(inputs.layer)).not.toMatch(/sentinela|ficticio|texto-livre|segredo|opaque/);
  expect(await siteEvents(page)).toEqual([
    { event: 'vl_page_view', route: '/solucoes/', page_location: clean, page_referrer: '' },
    { event: 'vl_ads_page_view', route: '/solucoes/' }
  ]);
});

test('Free text and duplicate campaign fields are excluded', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.goto(origin + '/?utm_source=linkedin&utm_source=google&utm_medium=cpc&utm_campaign=nome-sobrenome-41999999999');
  await accept(banner(page)).click();
  await expect(page).toHaveURL(origin + '/?utm_medium=cpc');
  await expect.poll(() => requests.length).toBe(1);
  expect((await siteEvents(page))[0].page_location).toBe(origin + '/?utm_medium=cpc');
});

test('A plain known referral origin is available to GA4 without its URL details', async ({ page }) => {
  await stubGtm(page);
  await page.goto(origin + '/', { referer: 'https://www.google.com/' });
  await accept(banner(page)).click();
  expect((await siteEvents(page))[0].page_referrer).toBe('https://www.google.com/');
});

test('Revocation in one tab stops measurement in a second open tab', async ({ page, context }) => {
  await stubGtm(page);
  await page.goto(origin + '/');
  await accept(banner(page)).click();
  const other = await context.newPage();
  const requests = await stubGtm(other);
  await other.goto(origin + '/solucoes/');
  await expect.poll(() => requests.length).toBe(1);
  await consentSettings(page).click();
  await Promise.all([other.waitForEvent('load'), reject(consentDialog(page)).click()]);
  await expect(consentSettings(other)).toBeVisible();
  expect(await siteEvents(other)).toEqual([]);
  expect(requests).toHaveLength(1);
});

for (const width of [320, 375, 390, 768, 1440]) {
  test('Consent and commercial navigation work at ' + width + 'px', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
    await page.setViewportSize({ width, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(origin + '/solucoes/');
    await expect(banner(page)).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await personalize(page).focus();
    await page.keyboard.press('Enter');
    const dialog = consentDialog(page);
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('heading')).toBeFocused();
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body ||
        !!document.activeElement.closest('dialog[open]'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(personalize(page)).toBeFocused();
    const cta = page.getByRole('link', { name: 'Fazer diagnóstico gratuito' });
    await cta.scrollIntoViewIfNeeded();
    await cta.click({ trial: true });
    await page.getByRole('navigation', { name: 'Menu da Vértice' }).getByRole('link', { name: 'Ferramentas' }).click({ trial: true });
    await reject(banner(page)).click();
    await expect(consentSettings(page)).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('Ads-only can start on an already-clean URL reached from a detailed referrer', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.goto(origin + '/solucoes/', { referer: origin + '/?contact=sentinela' });
  await personalize(page).click();
  await consentDialog(page).getByRole('checkbox', { name: 'Publicidade' }).check();
  await save(page).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(await page.evaluate(() => document.referrer)).toBe('');
  expect(await siteEvents(page)).toEqual([{ event: 'vl_ads_page_view', route: '/solucoes/' }]);
});

for (const width of [320, 375, 390, 768, 1440]) {
  test('Shared navigation, tool layout and catalog routes work at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.addInitScript(() => localStorage.setItem('vertice_measurement_consent_v2', 'none'));
    for (const route of [
      '/', '/pt/', '/solucoes/', '/raio-x-vendas/', '/tuning/', '/n1/', '/n1/equipe/',
      '/n1/etiquetas/', '/n1/visao/', '/n1/visao/fotos/', '/duelo-bot/',
      '/observatorio/', '/observatorio/frete-search-console/', '/drops/',
      '/radar-ia-cripto/', '/perps/', '/privacy/', '/estudos/mecatronica/'
    ]) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
      const english = route === '/';
      const nav = page.getByRole('navigation', { name: english ? 'Vértice navigation' : 'Menu da Vértice' });
      await expect(nav, route).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(width);
      const menu = await nav.boundingBox();
      for (const label of english ? ['Tools', 'Solutions (PT)', 'Observatory'] : ['Ferramentas', 'Soluções', 'Observatório']) {
        const target = await nav.getByRole('link', { name: label, exact: true }).boundingBox();
        expect(target.height, route).toBeGreaterThanOrEqual(44);
        expect(target.y + target.height, route).toBeLessThanOrEqual(menu.y + menu.height);
      }
    }
    const catalog = page.getByRole('navigation', { name: 'Menu da Vértice' }).getByRole('link', { name: 'Ferramentas' });
    await catalog.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(origin + '/pt/');
    const diagnostic = page.getByRole('link', { name: 'Fazer diagnóstico grátis', exact: true });
    await diagnostic.scrollIntoViewIfNeeded();
    await expect(diagnostic).toBeInViewport();
    await diagnostic.click();
    await expect(page).toHaveURL(origin + '/raio-x-vendas/');
    await page.locator('#ticket').fill('180');
    await expect(page.locator('#ticket')).toHaveValue('180');
  });
}

test('Revenue OS pilot preserves known tags and omits unrelated input', async ({ page }) => {
  const known = '?utm_source=linkedin&utm_medium=organic_social&utm_campaign=revenue-os-piloto-cwb&extra=sentinel';
  await page.goto(origin + '/solucoes/' + known);
  const diagnostic = page.locator('main a[href*="/raio-x-vendas/"]').first();
  const whatsapp = page.locator('main a[href^="https://wa.me/"]').first();
  expect(new URL(await diagnostic.getAttribute('href')).searchParams.get('utm_source')).toBe('linkedin');
  expect(new URL(await whatsapp.getAttribute('href')).searchParams.get('text')).toContain('Origem da campanha: linkedin');
  expect(await whatsapp.getAttribute('href')).not.toContain('sentinel');

  await page.goto(origin + '/solucoes/' + known.replace('linkedin', 'unknown'));
  await expect(diagnostic).toHaveAttribute('href', '/raio-x-vendas/');
  expect(new URL(await whatsapp.getAttribute('href')).searchParams.get('text')).not.toContain('Origem da campanha');
});

test('Revenue OS links Soluções to Raio-X and offers a clean WhatsApp draft', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.addInitScript(() => {
    window.open = url => { window.openedForTest = url; };
  });
  const tags = 'utm_source=linkedin&utm_medium=organic_social&utm_campaign=revenue-os-piloto-cwb';
  const sensitive = '&email=sentinela%40example.invalid&tel=41999999999&utm_content=texto-livre';
  await page.goto(origin + '/solucoes/?' + tags + sensitive);
  await accept(banner(page)).click();
  await expect(page).toHaveURL(origin + '/solucoes/?' + tags);
  await page.getByRole('link', { name: 'Fazer diagnóstico gratuito' }).click();
  await expect(page).toHaveURL(origin + '/raio-x-vendas/?' + tags);
  await page.locator('#whats').click();
  const draft = new URL(await page.evaluate(() => window.openedForTest)).searchParams.get('text');
  expect(draft).toContain('linkedin / organic_social / revenue-os-piloto-cwb');
  const events = await siteEvents(page);
  expect(events.find(item => item.event === 'vl_page_view').page_location).toBe(origin + '/raio-x-vendas/?' + tags);
  expect(events.find(item => item.event === 'vl_contact_intent')).toEqual({
    event: 'vl_contact_intent', route: '/raio-x-vendas/', channel: 'whatsapp', cta: 'whats'
  });
  expect(draft + JSON.stringify(events)).not.toMatch(/sentinela|41999999999|texto-livre/);
  await expect.poll(() => requests.length).toBe(2);
});

test('Raio-X discards unregistered and repeated attribution fields before opt-in', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.addInitScript(() => {
    window.open = url => { window.openedForTest = url; };
  });
  const campaign = '&utm_campaign=revenue-os-piloto-cwb&utm_medium=organic_social';
  for (const query of ['utm_source=nome-41999999999', 'utm_source=linkedin&utm_source=sentinela']) {
    await page.goto(origin + '/raio-x-vendas/?' + query + campaign);
    await reject(banner(page)).click();
    await page.locator('#whats').click();
    const draft = new URL(await page.evaluate(() => window.openedForTest)).searchParams.get('text');
    expect(draft).toContain('Origem da visita: não informada');
    expect(draft).not.toMatch(/sentinela|41999999999|revenue-os-piloto-cwb/);
    expect(await siteEvents(page)).toEqual([]);
    expect(requests).toEqual([]);
    await page.evaluate(() => localStorage.removeItem('vertice_measurement_consent_v2'));
  }
});

test('Homepage prioritizes Drops and Observatório while preserving featured business tools', async ({ page }) => {
  await page.goto(origin + '/pt/catalogo/');
  const groups = page.locator('.catalog > .tool-group');
  await expect(groups.first().locator('h2')).toHaveText('Recursos e pesquisa');
  await expect(groups.first().locator('.card h3')).toHaveText(['Vértice Drops', 'Observatório', 'Astro Lab — mapa natal']);
  await expect(groups.first().locator('a[href="/drops/"]')).toHaveCount(1);
  await expect(groups.first().locator('a[href="/observatorio/"]')).toHaveCount(1);
  await expect(groups.nth(1).locator('h2')).toHaveText('Negócios e operação');
});

test('Leo Klein portfolio keeps its own styles, honest proof and responsive layout', async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 860 });
    await page.goto(origin + '/klein/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Solicitar proposta/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ver projetos publicados/i })).toBeVisible();
    await expect(page.locator('.kl-terminal-badge')).toHaveText('DADOS FICTÍCIOS');
    await expect(page.locator('link[href="/assets/klein.css"]')).toHaveCount(1);
    await expect(page.locator('script[src*="measurement.js"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const nav = page.getByRole('navigation', { name: 'Menu da Vértice' });
    await expect(nav).toBeInViewport();
    await expect(nav.getByRole('link', { name: 'Ferramentas' })).toBeVisible();
  }

  await page.goto(origin + '/pt/catalogo/');
  const founder = page.locator('.vl-home .vt-founder');
  await expect(founder.getByRole('link', { name: /Ver portfólio e serviços/i })).toHaveAttribute('href', '/klein/');
  await founder.getByRole('link', { name: /Ver portfólio e serviços/i }).click();
  await expect(page).toHaveURL(origin + '/klein/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Criativos para vender');
});


test('Astro Lab creates a natal reading without sending birth data', async ({ page }) => {
  const outbound = [];
  await page.route('https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/+esm', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body: [
        'export const Body = { Moon: "Moon", Mercury: "Mercury", Venus: "Venus", Mars: "Mars", Jupiter: "Jupiter", Saturn: "Saturn", Uranus: "Uranus", Neptune: "Neptune", Pluto: "Pluto" };',
        'export function SunPosition() { return { elon: 290 }; }',
        'export function EclipticLongitude() { throw Error("Heliocentric API must not be called"); }',
        'export function EclipticGeoMoon() { return { lon: 263.47 }; }',
        'export function GeoVector(body) { return { body }; }',
        'export function Ecliptic(vector) { return { elon: ({ Mercury: 225.3, Venus: 221.24, Mars: 314.56, Jupiter: 105.32, Saturn: 72.76, Uranus: 321.04, Neptune: 306.25, Pluto: 254.36 })[vector.body] }; }',
        'export function SiderealTime() { return 10; }'
      ].join('\n')
    }));
  page.on('request', req => {
    if (req.method() !== 'GET') outbound.push(req.url());
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(origin + '/horoscopo/');
  await expect(page.getByRole('heading', { name: /O céu tem coordenadas/ })).toBeVisible();
  await page.locator('#person').fill('Teste Privado');
  await page.locator('#birth-date').fill('2000-01-01');
  await page.locator('#birth-time').fill('12:00');
  await page.locator('#place').selectOption('-25.4284,-49.2733');
  await expect(page.locator('#utc-offset')).toHaveValue('-2');
  await page.getByRole('button', { name: /Calcular meu mapa/ }).click();
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#big-three .sign-card')).toHaveCount(3);
  await expect(page.locator('#map-title')).toHaveText('Mapa natal de Teste Privado');
  await expect(page.locator('#reading-title')).toHaveText('Seu céu de hoje');
  await expect(page.locator('#wheel text')).not.toHaveCount(0);
  expect(outbound).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('vertice-astro-birth-v1'))).toBeNull();
  await page.locator('#save').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vertice-astro-birth-v1'))).not.toBeNull();
  await page.reload();
  await expect(page.locator('#person')).toHaveValue('Teste Privado');
  await page.locator('#unknown-time').check();
  await page.getByRole('button', { name: /Calcular meu mapa/ }).click();
  await expect(page.locator('#time-caveat')).toContainText('Ascendente e casas omitidos');
  await page.locator('#clear').click();
  expect(await page.evaluate(() => localStorage.getItem('vertice-astro-birth-v1'))).toBeNull();
  await expect(page.locator('#result')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});


test('Astro Lab matches independent geocentric positions and historical DST with a public date fixture', async ({ page }) => {
  await page.goto(origin + '/horoscopo/');
  // Public astronomical reference day, distinct from any personal birth record.
  await page.locator('#birth-date').fill('2001-11-16');
  await page.locator('#birth-time').fill('09:00');
  await page.locator('#place').selectOption('-25.4284,-49.2733');
  await expect(page.locator('#utc-offset')).toHaveValue('-2');
  await expect(page.locator('#utc-offset')).toHaveAttribute('readonly');
  await page.getByRole('button', { name: /Calcular meu mapa/ }).click();
  await expect(page.locator('#result')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('#big-three .sign')).toHaveText(['Escorpião', 'Sagitário', 'Capricórnio']);
  const placements = page.locator('#planets .planet-row');
  await expect(placements.nth(2)).toContainText('Mercúrio');
  await expect(placements.nth(2)).toContainText('Escorpião');
  await expect(placements.nth(4)).toContainText('Aquário');
  await expect(page.locator('#planets')).not.toContainText('Touro 25.2°');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test('CRM operator can create, edit, filter and reopen a lead on mobile', async ({ page }) => {
  test.skip(process.env.SITE_TEST_ORIGIN && !process.env.SITE_TEST_ORIGIN.includes('127.0.0.1'), 'Uses synthetic data on the local site');
  await page.setViewportSize({ width: 375, height: 812 });
  const rows = new Map();
  const exceptions = [];
  page.on('pageerror', error => exceptions.push(error.message));
  let signedIn = false;
  await page.route('https://api.verticelabs.me/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(3);
    const method = request.method();
    if (path === '/account/sessions/email') {
      expect(request.postDataJSON().email).toBe('admin@verticelabs.me');
      signedIn = true;
      return route.fulfill({ status: 201, json: {} });
    }
    if (!signedIn) return route.fulfill({ status: 401, json: {} });
    if (path === '/account/sessions/current') {
      signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/account') return route.fulfill({ json: {} });
    if (method === 'POST') {
      const { rowId, data } = request.postDataJSON();
      rows.set(rowId, { $id: rowId, ...data });
      return route.fulfill({ status: 201, json: rows.get(rowId) });
    }
    const id = path.split('/').at(-1);
    if (id === 'rows') return route.fulfill({ json: { rows: [...rows.values()] } });
    if (method === 'PATCH') Object.assign(rows.get(id), request.postDataJSON().data);
    return route.fulfill({ json: rows.get(id) });
  });
  await page.goto(origin + '/crm/');
  await expect(page.locator('#workspace')).toBeHidden();
  await page.getByLabel('Usuário ou e-mail').fill('admin');
  await page.getByLabel('Senha').fill('synthetic-test-password');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Novo lead' }).click();
  await page.getByLabel('Empresa').fill('Empresa de teste');
  await page.getByLabel('WhatsApp').fill('41 99999-0000');
  await page.getByRole('button', { name: 'Salvar dados' }).click();
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5541999990000');
  await page.getByRole('button', { name: 'Editar dados' }).click();
  await page.getByLabel('Empresa').fill('Empresa revisada');
  await page.getByRole('button', { name: 'Salvar dados' }).click();
  await expect(page.locator('#company')).toHaveText('Empresa revisada');
  await page.locator('#pipeline [name="stage"]').selectOption('Qualificado');
  await page.getByLabel('Retorno').fill('2026-12-01');
  await page.getByLabel('Registrar contato').fill('Contato de teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('#history')).toContainText('Contato de teste');
  await page.reload();
  await page.getByLabel('Buscar lead').fill('revisada');
  await page.locator('#stage-filter').selectOption('Perdido');
  await expect(page.locator('#leads tr')).toHaveCount(0);
  await page.locator('#stage-filter').selectOption('Qualificado');
  await page.getByRole('button', { name: 'Empresa revisada' }).click();
  await expect(page.getByLabel('Retorno')).toHaveValue('2026-12-01');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#leads tr')).toHaveCount(0);
  expect(exceptions).toEqual([]);
});

test('an unconfigured container leaves measurement dormant', async ({page}) => {
  await page.route('**/assets/measurement.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/var GTM_ID = '[^']*';/, "var GTM_ID = '';");
    await route.fulfill({response, body});
  });
  await page.goto(origin + '/solucoes/');
  await expect(page.locator('.vl-consent')).toHaveCount(0);
  expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
});


test('CRM recovers from a temporary account request failure without exposing leads', async ({ page }) => {
  let attempts = 0;
  await page.route('https://api.verticelabs.me/v1/account', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({status: 204, headers: {
        'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type,x-appwrite-project'
      }});
    }
    attempts++;
    await route.fulfill({status: attempts === 1 ? 503 : 401, contentType: 'application/json',
      headers: {'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true'},
      body: '{}'});
  });
  await page.goto(origin + '/crm/');
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('Entre com sua conta autorizada.');
  await expect(page.locator('#workspace')).toBeHidden();
  expect(attempts).toBe(2);
});

test('CRM leaves a recovery control available after persistent network failure', async ({ page }) => {
  await page.route('https://api.verticelabs.me/v1/account', route => route.abort('failed'));
  await page.goto(origin + '/crm/');
  await expect(page.locator('#status')).toContainText('Não foi possível verificar a sessão');
  await expect(page.getByRole('button', {name: 'Tentar novamente'})).toBeVisible();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
});


test('Mobile recovery mirrors the original calculator without changing WhatsApp summary', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.addInitScript(() => localStorage.setItem('vertice_measurement_consent_v2','none'));
  await page.goto(origin + '/raio-x-vendas/');
  await page.locator('#ticket').fill('1800');
  await expect(page.locator('#potential-mobile')).toHaveText(await page.locator('#potential').innerText());
  await expect(page.locator('.mobile-result')).toBeInViewport();
  await page.getByRole('link',{name:'Ver resultado',exact:true}).click();
  await expect(page.locator('#resultTitle')).toBeInViewport();
});
