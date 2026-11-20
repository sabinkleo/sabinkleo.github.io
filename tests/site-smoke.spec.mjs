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

test('measurement is inert in production config and honors consent with a test container', async ({ page }) => {
  let providerRequests = 0;
  await page.route('https://www.googletagmanager.com/**', async route => {
    providerRequests += 1;
    await route.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.goto(origin + '/solucoes/');
  await expect(page.getByRole('dialog', { name: 'Preferências de privacidade' })).toHaveCount(0);
  expect(providerRequests).toBe(0);
  await page.route('**/assets/measurement.js', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace("var GTM_ID = '';", "var GTM_ID = 'GTM-TEST';");
    await route.fulfill({ response, body: source });
  });
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Preferências de privacidade' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Rejeitar' }).click();
  expect(providerRequests).toBe(0);
  await page.getByRole('button', { name: 'Revisar consentimento de métricas e anúncios' }).click();
  await dialog.getByRole('button', { name: 'Aceitar métricas e anúncios' }).click();
  await expect.poll(() => providerRequests).toBe(1);
  expect(await page.evaluate(() => window.dataLayer.filter(x => x.event === 'vl_page_view').length)).toBe(1);
  await page.getByRole('button', { name: 'Revisar consentimento de métricas e anúncios' }).click();
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', { name: 'Rejeitar' }).click()]);
  expect(providerRequests).toBe(1);
  await page.goto(origin + '/privacy/');
  await expect(page.locator('script[src*="measurement.js"]')).toHaveCount(0);
  expect(providerRequests).toBe(1);
});
