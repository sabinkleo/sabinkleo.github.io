const {chromium} = require('playwright-core');

async function capture() {
  const [url, output, browserPath] = process.argv.slice(2);
  const browser = await chromium.launch({executablePath: browserPath, args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1080, height: 1080}});
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 16000});
    const heading = page.locator('article h1, main h1, h1').first();
    await heading.waitFor({timeout: 5000});
    await page.screenshot({path: output, timeout: 6000, animations: 'disabled'});
  } finally {
    await browser.close();
  }
}

capture().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
