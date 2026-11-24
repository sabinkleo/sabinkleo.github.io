import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');
const en = read('dist/index.html');
const pt = read('dist/pt/index.html');
assert.match(en, /<html lang="en"/);
assert.match(pt, /<html lang="pt-BR"/);
assert.match(en, /Investigate\./);
assert.match(pt, /Investigue\./);
assert.match(en, /href="\/pt\/"[^>]*hreflang="pt-BR"/);
assert.match(pt, /href="\/"[^>]*hreflang="en"/);
for (const html of [en, pt]) {
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
