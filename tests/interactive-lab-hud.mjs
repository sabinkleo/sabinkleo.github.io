import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? {executablePath:process.env.CHROMIUM_PATH} : {channel:'chrome'});
const base='http://127.0.0.1:8766';
try {
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',
    permissions:['clipboard-read','clipboard-write']});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base || url.pathname === '/favicon.ico') return route.fulfill({status:204});
    return route.continue();
  });
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto(base+'/en/lab/');
  await page.locator('svg [data-state=active]').waitFor();
  assert.equal(await page.locator('svg [data-state=active] text').textContent(),'Gemini');
  await page.getByRole('button',{name:'Inject HTTP 429'}).click();
  assert.equal(await page.locator('svg [data-state=active] text').textContent(),'NVIDIA NIM');
  assert.match(await page.locator('[data-trace]').innerText(),/"event":"circuit.open".*"status":429/);
  await page.getByRole('button',{name:'Kill Primary Provider'}).click();
  assert.match(await page.locator('[data-trace]').innerText(),/"status":503/);
  const canvas=page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-reading]').value!=='—');
  assert.equal(await page.locator('[data-play]').textContent(),'Play');
  assert.ok(await canvas.evaluate(el=>el.getContext('2d').getImageData(6,6,1,1).data[3]===255));
  await page.locator('#pull-rpm').fill('4880');
  const baseTorque=await page.locator('[data-reading]').first().textContent();
  assert.match(await page.locator('[data-event]').textContent(),/Knock correction · −4/);
  await page.getByRole('button',{name:'Calibrated Map'}).click();
  assert.notEqual(await page.locator('[data-reading]').first().textContent(),baseTorque);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('[data-rpm]').value)>4900);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const [path,locale] of [['/pt/','pt'],['/observatorio/','pt'],['/en/lab/','en']]) {
    await page.goto(base+path);
    await page.keyboard.press('Control+k');
    const input=page.getByRole('combobox');
    await input.fill(locale==='pt'?'grade':'grid');await input.press('Enter');
    assert.notEqual(await page.evaluate(()=>localStorage.getItem('vertice.telemetry-grid')),null);
    await input.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  }
  await page.keyboard.press('Control+k');
  const input=page.getByRole('combobox');await input.fill('WhatsApp');await input.press('Enter');
  await page.waitForFunction(async()=>await navigator.clipboard.readText()==='+5541998844684');
  await input.fill('Linux');await input.press('Enter');await page.waitForURL('**/en/linux-security/');
  assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('vl-scan')));
  assert.deepEqual(errors,[]);
  console.log('Chromium verified failover, ECU replay, reduced motion, mobile width, PT/EN/legacy HUD, clipboard, grid persistence and keyboard navigation.');
} finally { await browser.close(); }
