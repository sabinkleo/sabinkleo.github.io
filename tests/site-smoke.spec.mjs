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
