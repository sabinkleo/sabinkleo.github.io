import {test,expect} from '@playwright/test';
import {localResult} from '../assets/ai-contract.mjs';
const base='http://127.0.0.1:8766';
test.use({channel:process.env.CHROMIUM_PATH?undefined:'chrome',launchOptions:{executablePath:process.env.CHROMIUM_PATH},reducedMotion:'reduce'});
for(const status of [200,429]){
  test.describe('gateway '+status,()=>{
    let calls,unsafe;
    test.beforeEach(async({page})=>{
      calls=[];unsafe=false;
      await page.route('**/api/ai',route=>{
        const p=route.request().postDataJSON();calls.push(p);
        const result=localResult(p);if(unsafe)result.executive_narrative='<img src=x onerror=window.xss=1>';return route.fulfill({status,json:status===200?{source:'gateway',result}:{error:'Rate limited'}});
      });
    });
    test('hero and command palette preview before routing',async({page})=>{
      await page.goto(base);const hero=page.locator('[data-ai-entry=intent]');
      await hero.getByRole('textbox').fill('FT550 turbo private-example');await hero.getByRole('button',{name:'Preview route'}).click();
      await expect(hero.locator('a')).toHaveAttribute('href',/auto-telemetry.*FT550/);
      await page.keyboard.press('Control+k');const dialog=page.getByRole('dialog');
      await dialog.getByRole('textbox').fill('Linux SSH');await dialog.getByText('Preview route').click();
      await dialog.getByRole('link',{name:'Open linux-security'}).click();
      await expect(page.locator('[data-ai-entry=intake] textarea')).toHaveValue(/SSH/);
      expect(JSON.stringify(calls)).not.toContain('private-example');
    });
    for(const [track,input] of [['auto-telemetry','Civic 2011 turbo FT550'],['ai-ops','Gemini 429 retry']]){
      test('intake '+track,async({page})=>{
        await page.goto(base+'/en/'+track+'/');const box=page.locator('[data-ai-entry=intake]');await box.scrollIntoViewIfNeeded();
        await box.getByRole('textbox').fill(input);await box.getByText('Analyze setup').click();
        await expect(box).toHaveAttribute('data-source',status===200?'gateway':'local');
        await expect(box.locator('pre')).toContainText('21–30');await expect(box.locator('a')).toHaveAttribute('href',/wa.me.*text=/);
        await expect.poll(()=>calls.length).toBe(1);
      });
    }
    test('both telemetry events',async({page})=>{
      await page.goto(base+'/en/lab/');await page.locator('#narrate').check();await page.locator('[data-rate]').click();
      await expect(page.locator('#narration')).toContainText('quota');await page.locator('#pull-rpm').scrollIntoViewIfNeeded();
      await expect(page.locator('[data-reading]').first()).not.toHaveText('—');
      await page.locator('#pull-rpm').evaluate(el=>{el.value='4880';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(page.locator('#narration')).toContainText('knock');
      await page.locator('#lab-remix').click();await expect.poll(()=>calls.length).toBe(3);
    });
    test('local teardown, opt-in audit and print safety',async({page})=>{
      await page.goto(base+'/en/teardown/?c=%3Cscript%3Eprivate-example');await page.locator('#sample').click();
      await expect(page.locator('#status')).toHaveText('Analysis complete.');expect(calls).toHaveLength(0);
      await page.locator('#deep-audit').click();await expect(page.locator('#audit-result')).toContainText('Contra-Intuitivo');
      await expect.poll(()=>calls.length).toBe(1);expect(Object.keys(calls[0]).sort()).toEqual(['action','checks','entities','findings','lang','remix','vertical']);
      expect(JSON.stringify(calls)).not.toContain('private-example');
      unsafe=true;await page.locator('#audit-remix').click();await expect.poll(()=>calls.length).toBe(2);await expect(page.locator('#audit-result img')).toHaveCount(0);expect(await page.evaluate(()=>window.xss)).toBeUndefined();
      await page.emulateMedia({media:'print'});await expect(page.locator('#audit-result')).toBeVisible();
    });
    test('operator queue, archive, deduplication and creative handoff',async({page})=>{
      const endpoint='https://mock.verticelabs.me/v1';
      await page.route('**/crm/config.json',r=>r.fulfill({json:{endpoint,project:'p',database:'d',table:'t'}}));
      await page.route(endpoint+'/**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true'},json:r.request().url().includes('/account')?{}:{rows:[{$id:'fixture',lead:JSON.stringify({name:'Fixture',segment:'mobile',whatsapp:'5541999990000',hypotheses:[{text:'Medir fila'},{text:'medir fila'}],reviewed_archive:[{text:'Anterior'}]}),state:'{}'}]}}));
      await page.goto(base+'/crm/');await page.getByRole('button',{name:'Fixture'}).click();
      await expect(page.locator('#hypotheses li')).toHaveCount(1);await expect(page.locator('#archive')).not.toHaveAttribute('open','');
      await page.locator('#generate-hook').click();await expect(page.locator('#ai-hypothesis')).toContainText('Cavalo de Troia');
      await expect(page.locator('#hook-wa')).toHaveAttribute('href',/wa.me.*text=/);await expect.poll(()=>calls.length).toBe(1);
      const columns=await page.locator('.command-center').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);expect(columns).toBe(2);
    });
  });
}
