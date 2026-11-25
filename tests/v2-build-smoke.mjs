import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');
const en = read('dist/index.html');
const pt = read('dist/pt/index.html');
assert.match(en, /<html lang="en"/);
assert.match(pt, /<html lang="pt-BR"/);
assert.match(en, /Turn signals/);
assert.match(pt, /Transforme sinais/);
assert.match(en, /href="\/pt\/"[^>]*hreflang="pt-BR"/);
assert.match(pt, /href="\/"[^>]*hreflang="en"/);
for (const html of [en, pt]) {
  assert.ok(html.includes('product-shell'));
  assert.ok(html.includes('editorial-highlights'));
  assert.ok(html.includes('highlight-grid'));
  assert.ok(html.includes('data-ai-entry="intent"'));
  assert.ok(!html.includes('metric-grid'), 'Decorative metrics returned');
  assert.ok(html.includes('href="/pt/catalogo/"'));
  assert.ok(existsSync('dist/pt/catalogo/index.html'));
  for (const route of ['/observatorio/', '/raio-x-vendas/', '/n1/', '/tuning/', '/privacy/', '/duelo-bot/', '/perps/']) {
    assert.ok(html.includes('href="' + route + '"'), route);
    assert.ok(existsSync('dist' + route + 'index.html'), 'Missing built route: ' + route);
  }
  assert.ok(html.includes('/assets/measurement.js'));
}
for (const name of ['index.html', 'config.json', 'crm.mjs', 'transfer.mjs', 'style.css']) {
  assert.equal(read('dist/crm/' + name), read('crm/' + name), 'CRM changed during build: ' + name);
}
assert.equal(read('dist/CNAME'), read('CNAME'));
console.log('V2 built routes, language switch, tracking and untouched CRM checks passed');

for (const slug of ['', 'ai-ops/', 'linux-security/', 'auto-telemetry/']) {
  const route = '/en/' + slug;
  const page = read('dist' + route + 'index.html');
  const url = 'https://verticelabs.me' + route;
  assert.ok(page.includes('rel="canonical" href="' + url + '"'), route);
  assert.ok(page.includes('property="og:url" content="' + url + '"'), route);
  assert.ok(page.includes('name="twitter:card"'), route);
  const json = page.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  assert.equal(JSON.parse(json[1]).url, url);
  if (slug) {
    assert.ok(page.includes('client="visible"'), route);
    assert.equal((page.match(/<select\b/g) ?? []).length, 4);
    assert.ok(page.includes('Continue to WhatsApp'), route);
  }
}
console.log('English hub, three diagnostics, structured data and handoffs verified.');

const manifest=JSON.parse(read('dist/observatorio/edicoes.json'));
for(const slug of Object.keys(manifest)){
  const context=JSON.parse(read('dist/observatorio/'+slug+'/context.json'));
  assert.equal(context.slug,slug);
  assert.ok(context.summary && context.sources.length);
  for(const key of ['review','history','social_package','rubric'])assert.ok(!(key in context));
}
for(const route of ['n1','drops','tuning','raio-x-vendas','estudos/mecatronica','horoscopo','klein']){
  assert.ok(read('dist/'+route+'/index.html').includes('/assets/product-tools.css'),route);
}
assert.ok(!read('dist/crm/index.html').includes('/assets/product-tools.css'));
console.log('Article context and public tool styling checks passed.');
