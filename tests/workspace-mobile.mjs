import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch();
try {
  for(const width of [320,375,390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:900}});
    for(const [path,language,query,button] of [['/','en','Sales','Preview route'],['/pt/','pt-BR','Vendas','Ver trilha']]){
      const response=await page.goto('http://127.0.0.1:4321'+path);
      assert.equal(response.status(),200);
      assert.equal(await page.locator('html').getAttribute('lang'),language);
      assert.equal(await page.locator('.editorial-highlights .highlight').count(),3);
      const groups = page.locator('.product-catalog details');
      assert.equal(await groups.count(), 4);
      for (const group of await groups.all()) {
        const summary = group.locator('summary');
        const links = group.getByRole('link');
        await summary.focus();
        await page.keyboard.press('Enter');
        assert.ok(await links.first().isVisible());
        assert.equal(parseInt(await summary.locator('.resource-count').innerText(), 10), await links.count());
        await page.keyboard.press('Space');
        assert.equal(await group.getAttribute('open'), null);
      }
      assert.equal(await page.locator('.metric-grid').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+path+' overflow');
      const entry=page.locator('[data-ai-entry=intent]');
      await entry.getByRole('textbox').fill(query);
      await entry.getByRole('button',{name:button}).click();
      await entry.locator('a[href="/raio-x-vendas/"]').waitFor();
      await entry.getByRole('textbox').fill('zzzz-no-match');
      await entry.getByRole('button',{name:button}).click();
      assert.equal(await entry.locator('a').isVisible(),false);
    }
    await page.close();
  }
  console.log('Bilingual workspace passed across 5 viewport widths');
} finally {await browser.close();}
