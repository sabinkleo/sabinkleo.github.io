import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const base = 'http://127.0.0.1:8766';
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await page.route('**/*', route =>
    route.request().url().startsWith(base + '/') ? route.continue() : route.abort());

  for (const slug of ['ai-ops', 'linux-security', 'auto-telemetry']) {
    await page.goto(base + '/en/?utm_source=qa&utm_medium=local&utm_campaign=review&vertical=' + slug);
    await page.locator('article a[href*="/en/' + slug + '/"]').click();
    await page.waitForLoadState('networkidle');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), slug);
    const form = page.locator('.diagnostic');
    await form.scrollIntoViewIfNeeded();
    for (const [index, value] of ['0', '1', '2', '1'].entries()) {
      await form.locator('select').nth(index).selectOption(value);
    }
    await form.getByText('Calculate readiness').click();
    assert.match(await form.locator('[data-score]').innerText(), /50\/100/);
    assert.equal(await form.locator('li').count(), 3);
    await form.locator('[data-copy]').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Readiness: 50\/100/);
    await form.locator('[data-review]').click();
    await page.waitForLoadState('networkidle');
    const contact = new URL(await page.locator('[data-contact]').getAttribute('href'));
    const handoff = new URL(contact.searchParams.get('text').split('\n').at(-1));
    assert.deepEqual(Object.fromEntries(handoff.searchParams), {
      utm_source: 'qa', utm_medium: 'local', utm_campaign: 'review', vertical: slug, score: '50',
    });
    console.log(slug + ' mobile diagnostic and WhatsApp draft passed');
  }
} finally {
  await browser.close();
}

