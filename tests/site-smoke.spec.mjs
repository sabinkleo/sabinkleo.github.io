import { test, expect } from '@playwright/test';

const origin = process.env.SITE_TEST_ORIGIN || 'http://127.0.0.1:8765';
const routes = [
  '/',
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

test('Terminal visual layer is scoped, responsive and keeps the commercial links reachable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vertice_measurement_consent_v2', 'none'));
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/');
    await expect(page.locator('.vt-eyebrow')).toBeVisible();
    await expect(page.locator('link[href="/assets/terminal-design.css"]')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Abrir Raio-X de Vendas' })).toBeVisible();
    const homeStyles = await page.evaluate(() => ({
      grid: getComputedStyle(document.body).backgroundSize,
      cardRadius: getComputedStyle(document.querySelector('.vl-home .card')).borderRadius,
      headingFont: getComputedStyle(document.querySelector('.vl-home h1')).fontFamily,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(homeStyles.grid).toBe('52px 52px');
    expect(homeStyles.cardRadius).toBe('2px');
    expect(homeStyles.headingFont).toContain('Space Grotesk');
    expect(homeStyles.scrollWidth).toBeLessThanOrEqual(width);

    await page.goto(origin + '/solucoes/');
    await expect(page.locator('body')).toHaveClass(/vl-marketing/);
    await expect(page.getByRole('link', { name: 'Fazer diagnóstico gratuito' })).toBeVisible();
    const marketingStyles = await page.evaluate(() => ({
      cardRadius: getComputedStyle(document.querySelector('.pricing .box')).borderRadius,
      headingFont: getComputedStyle(document.querySelector('main h1')).fontFamily,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(marketingStyles.cardRadius).toBe('2px');
    expect(marketingStyles.headingFont).toContain('Space Grotesk');
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
    const nav = page.getByRole('navigation', { name: 'Menu da Vértice' });
    for (const route of [
      '/', '/solucoes/', '/raio-x-vendas/', '/tuning/', '/n1/', '/n1/equipe/',
      '/n1/etiquetas/', '/n1/visao/', '/n1/visao/fotos/', '/duelo-bot/',
      '/observatorio/', '/observatorio/frete-search-console/', '/drops/',
      '/radar-ia-cripto/', '/perps/', '/privacy/', '/estudos/mecatronica/'
    ]) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
      await expect(nav, route).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(width);
      const menu = await nav.boundingBox();
      for (const label of ['Ferramentas', 'Soluções', 'Observatório']) {
        const target = await nav.getByRole('link', { name: label, exact: true }).boundingBox();
        expect(target.height, route).toBeGreaterThanOrEqual(44);
        expect(target.y + target.height, route).toBeLessThanOrEqual(menu.y + menu.height);
      }
    }
    const catalog = nav.getByRole('link', { name: 'Ferramentas' });
    await catalog.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(origin + '/');
    const diagnostic = page.getByRole('link', { name: 'Abrir Raio-X de Vendas' });
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
