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

test('Revenue OS pilot preserves known tags and omits unrelated input', async ({ page }) => {
  const known = '?utm_source=linkedin&utm_medium=organic_social&utm_campaign=revenue-os-piloto-cwb&extra=sentinel';
  await page.goto(origin + '/solucoes/' + known);
  const diagnostic = page.locator('main a[href*="/raio-x-vendas/"]').first();
  const whatsapp = page.locator('main a[href^="https://wa.me/"]').first();
  expect(new URL(await diagnostic.getAttribute('href')).searchParams.get('utm_source')).toBe('linkedin');
  expect(decodeURIComponent(await whatsapp.getAttribute('href'))).toContain('Origem da campanha: linkedin');
  expect(await whatsapp.getAttribute('href')).not.toContain('sentinel');

  await page.goto(origin + '/solucoes/' + known.replace('linkedin', 'unknown'));
  await expect(diagnostic).toHaveAttribute('href', '/raio-x-vendas/');
  expect(decodeURIComponent(await whatsapp.getAttribute('href'))).not.toContain('Origem da campanha');
});
