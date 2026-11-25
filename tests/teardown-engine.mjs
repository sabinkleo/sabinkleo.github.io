import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:8766';
const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  const query = new URLSearchParams({
    c: 'Atlas <em id="markup-probe">R&D</em>', v: 'ai-ops', waste: '1800', g: 'single-key,no-cache,constructor',
    utm_source: 'outbound', utm_campaign: 'november', utm_content: 'brief',
  });
  await page.goto(base + '/en/teardown/?' + query);
  await page.waitForLoadState('networkidle');
  assert.match(await page.locator('#company').innerText(), /^Atlas /);
  assert.equal(await page.locator('#markup-probe').count(), 0);
  assert.ok(!(await page.locator('#company').innerText()).includes('<'));
  assert.equal(await page.locator('#savings').innerText(), '$1,350');
  assert.ok(await page.locator('#operator').isHidden());
  assert.equal(await page.locator('#phase-0 li').count(), 2);
  assert.ok(requests.every(url => new URL(url).origin === base));
  assert.ok(requests.every(url => !url.includes('/measurement.js')));
  const loaded = requests.length;
  for (const [track, count] of [['ai-ops',3],['linux-security',2],['auto-telemetry',3]]) {
    await page.selectOption('#track', track);
    await page.click('#sample');
    assert.equal(await page.locator('#findings li').count(), count, track);
    assert.match(await page.locator('#score').innerText(), /100\/100/);
    assert.match(await page.locator('#summary').innerText(), /Illustrative sample/);
    if (track === 'linux-security') assert.match(await page.locator('#diff').innerText(), /\+PermitRootLogin no/);
  }
  await page.selectOption('#track','linux-security');
  await page.fill('#raw','Status: active\n22/tcp ALLOW IN Anywhere\n443/tcp ALLOW IN 192.0.2.0/24');
  await page.click('#analyze');
  assert.match(await page.locator('#findings').innerText(), /22\/tcp/);
  assert.doesNotMatch(await page.locator('#findings').innerText(), /443/);
  await page.fill('#raw','PasswordAuthentication no\nMatch User demo\nPasswordAuthentication yes');
  await page.click('#analyze');
  assert.equal(await page.locator('#findings li').count(), 0);
  await page.selectOption('#track','ai-ops');
  const records = JSON.stringify([{provider:'test',request_hash:'private-canary',cost_usd:2,cache_hit:false},
    {provider:'test',request_hash:'private-canary',cost_usd:2,cache_hit:false}]);
  await page.locator('#drop-zone').evaluate((zone, contents) => {
    const data = new DataTransfer();
    data.items.add(new File([contents],'usage.json',{ type:'application/json' }));
    zone.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));
  }, records);
  await page.waitForFunction(() => document.querySelector('#summary').textContent.includes('Local input.'));
  assert.match(await page.locator('#summary').innerText(), /USD 2.00/);
  assert.doesNotMatch(await page.locator('#summary').innerText(), /sample/i);
  await page.fill('#raw','not valid usage');
  assert.ok(await page.locator('#diff').isHidden());
  await page.click('#analyze');
  assert.equal(await page.locator('#score').innerText(),'Awaiting evidence');
  await page.click('#sample');
  await page.locator('#recovery').fill('50');
  assert.equal(await page.locator('#savings').innerText(),'$2,700');
  const msg = new URL(await page.locator('#contact').getAttribute('href')).searchParams.get('text');
  const fields = new URLSearchParams(msg.split('\n').at(-1));
  assert.equal(fields.get('company'),await page.locator('#company').innerText());
  assert.equal(fields.get('vertical'),'ai-ops');
  assert.equal(fields.get('estimated_savings'),'2700');
  assert.equal(fields.get('utm_content'),'brief');
  assert.ok(!msg.includes('private-canary'));
  await page.click('#operator-toggle');
  await page.fill('#op-company','North & West');
  await page.selectOption('#op-track','auto-telemetry');
  await page.fill('#op-waste','900');
  await page.getByLabel('Knock indications',{exact:true}).check();
  await page.click('#op-copy');
  const shared = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(shared.pathname,'/en/teardown/');
  assert.equal(shared.searchParams.get('g'),'knock-events');
  assert.equal(shared.searchParams.get('c'),'North & West');
  assert.equal(shared.searchParams.get('waste'),'900');
  assert.equal(shared.searchParams.get('v'),'auto-telemetry');
  assert.equal(shared.searchParams.has('mode'),false);
  assert.equal(shared.searchParams.get('utm_campaign'),'november');
  await page.emulateMedia({media:'print'});
  for (const selector of ['#raw','#operator','#contact','#print']) assert.ok(await page.locator(selector).isHidden());
  for (const selector of ['#score','#company','#findings','.print-contact img']) assert.ok(await page.locator(selector).isVisible());
  assert.equal((await page.pdf()).subarray(0,5).toString(),'%PDF-');
  assert.deepEqual(requests.slice(loaded),[], 'Unexpected request during local analysis, copy or print');
  await page.emulateMedia({media:'screen'});
  await page.goto(shared.href + '&mode=operator');
  await page.locator('#op-copy').waitFor();
  assert.equal(await page.locator('#company').innerText(),'North & West');
  await page.goto(base + '/en/teardown/?v=constructor&waste=-30');
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#company').innerText(),'Your Engineering Team');
  assert.equal(await page.locator('#track').inputValue(),'ai-ops');
  assert.equal(await page.locator('#savings').innerText(),'$0');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors,[]);
  console.log('Teardown passed: three samples, sanitized URLs, file drop, scenario, roadmap, copy, contact, local-only network and print PDF.');
} finally {
  await browser.close();
}
