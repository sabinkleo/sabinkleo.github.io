import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:8765';
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

const consentDialog = page => page.getByRole('dialog', { name: 'Preferências de privacidade' });
const consentSettings = page => page.getByRole('button', { name: 'Revisar consentimento de métricas e anúncios' });
const siteEvents = page => page.evaluate(() => window.dataLayer.filter(item => item.event?.startsWith('vl_')));

test('GTM waits for consent, persists rejection and stops loading after revocation', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/solucoes/');
  const dialog = consentDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Estatísticas de uso')).not.toBeChecked();
  await expect(dialog.getByLabel('Medição de publicidade')).not.toBeChecked();
  expect(await page.evaluate(() => Array.from(window.dataLayer[0]))).toEqual([
    'consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    }
  ]);
  await dialog.getByRole('button', { name: 'Rejeitar opcionais' }).click();
  await page.reload();
  await expect(dialog).toHaveCount(0);
  expect(requests).toEqual([]);
  await consentSettings(page).click();
  await dialog.getByLabel('Estatísticas de uso').check();
  await dialog.getByRole('button', { name: 'Salvar escolhas' }).click();
  await expect.poll(() => requests).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-MPTCNSL9']);
  expect(await siteEvents(page)).toEqual([
    { event: 'vl_page_view', route: '/solucoes/', page_location: origin + '/solucoes/' }
  ]);
  await consentSettings(page).click();
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', { name: 'Rejeitar opcionais' }).click()]);
  await expect(consentSettings(page)).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(await siteEvents(page)).toEqual([]);
});

test('Meta event is limited to landing pages and excludes detailed URLs', async ({ page }) => {
  const requests = await stubGtm(page);
  await page.goto(origin + '/');
  const dialog = consentDialog(page);
  await dialog.getByLabel('Medição de publicidade').check();
  await dialog.getByRole('button', { name: 'Salvar escolhas' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(await siteEvents(page)).toEqual([{ event: 'vl_ads_page_view', route: '/' }]);
  for (const route of ['/tuning/', '/raio-x-vendas/', '/?example=private', '/#private']) {
    await page.goto(origin + route);
    expect(await siteEvents(page)).toEqual([]);
    expect(requests).toHaveLength(1);
  }
  for (const route of ['/n1/', '/n1/equipe/', '/privacy/', '/politica-de-privacidade/']) {
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
    { event: 'vl_page_view', route: '/raio-x-vendas/', page_location: origin + '/raio-x-vendas/' },
    { event: 'vl_contact_intent', route: '/raio-x-vendas/', channel: 'whatsapp', cta: 'whats' }
  ]);
  await page.goto(origin + '/tuning/');
  await page.locator('#btnAnalyze').click();
  expect(await siteEvents(page)).toEqual([
    { event: 'vl_page_view', route: '/tuning/', page_location: origin + '/tuning/' },
    { event: 'vl_tool_interaction', route: '/tuning/', tool: 'pre_dyno', action: 'manual_analysis' }
  ]);
  await expect.poll(() => requests.length).toBe(2);
});
