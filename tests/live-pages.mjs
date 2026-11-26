import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { accepted } from '../assets/ai-contract.mjs';

const site = 'https://verticelabs.me';
const worker = 'https://vertice-technical-triage-pages.sabino-fabio.workers.dev';
const browser = await chromium.launch({channel: 'chrome'});
try {
  const page = await browser.newPage({viewport: {width: 375, height: 812}});
  for (const route of ['/', '/pt/', '/pt/catalogo/', '/en/', '/en/lab', '/en/teardown', '/crm/']) {
    const response = await page.goto(site + route, {waitUntil: 'domcontentloaded'});
    console.log(route, response?.status());
    assert.equal(response?.status(), 200, route);
    assert.equal(new URL(page.url()).origin, site);
  }
  for (const [path,lang,query,button] of [['/','en','Sales','Preview route'],['/pt/','pt-BR','Vendas','Ver trilha'],['/pt/catalogo/','pt-BR','Vendas','Ver trilha']]) {
    await page.goto(site + path, {waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' overflow');
    if(path !== '/pt/catalogo/') {
      await page.locator('.diagnosis-preview').waitFor();
      assert.equal(await page.locator('.metric-grid').count(),0);
      assert.equal(await page.locator('.editorial-highlights .highlight').count(),3);
      assert.equal(await page.locator('.product-catalog details.resource-group').count(),4);
    }
    const entry=page.locator('[data-ai-entry=intent]');
    await entry.getByRole('textbox').fill(query);
    await entry.getByRole('button',{name:button}).click();
    await entry.locator('a[href="/raio-x-vendas/"]').waitFor();
    await entry.getByRole('textbox').fill('zzzz-no-match');
    await entry.getByRole('button',{name:button}).click();
    assert.equal(await entry.locator('a').isVisible(),false);
  }
  await page.goto(site + '/en/', {waitUntil: 'domcontentloaded'});
  const payload = {action:'intent', lang:'en', vertical:'ai-ops', entities:['429']};
  const responses = await page.evaluate(async ({worker, payload}) => {
    const results = [];
    for (const [path, data] of [['/api/triage', {vertical:'ai-ops', answers:[0,0,0,0]}], ['/api/ai', payload]]) {
      try {
        const response = await fetch(worker + path, {method:'POST', credentials:'omit',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify(data), signal:AbortSignal.timeout(15000)});
        const body = await response.json().catch(() => null);
        results.push({path, status:response.status, body});
      } catch {
        results.push({path, status:0, body:null});
      }
    }
    return results;
  }, {worker, payload});
  for (const result of responses) console.log(result.path, result.status || 'browser fetch failed', result.body?.source || '');
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.score, 0);
  assert.equal(responses[1].status, 200);
  assert.ok(accepted(payload, responses[1].body.result));
  const hero = page.locator('[data-ai-entry=intent]');
  await hero.getByRole('textbox').fill('Gemini 429');
  await hero.getByRole('button', {name:'Preview route'}).click();
  await hero.locator('a[href*="/en/ai-ops/"]').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
} finally {
  await browser.close();
}
