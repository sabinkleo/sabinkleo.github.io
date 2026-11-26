import { fileURLToPath } from 'node:url';
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const legacyPaths = [
  'src/styles/tokens.css', 'CNAME', 'robots.txt', 'analise-cripto', 'assets', 'bot/data', 'bot/history',
  'bot/results', 'bot/state', 'crm/config.json', 'crm/crm.mjs', 'crm/index.html',
  'crm/style.css', 'crm/transfer.mjs', 'drops', 'duelo-bot', 'estudos', 'horoscopo', 'klein',
  'n1', 'observatorio', 'perps', 'politica-de-privacidade', 'privacy',
  'radar-ia-cripto', 'raio-x-vendas', 'signal-lab', 'solucoes', 'tuning', 'tunning',
];

// Export only explicitly published editorial fields; no review notes, internal data or credentials.
async function buildArticleContexts(dir) {
  const manifest = JSON.parse(await readFile(new URL('observatorio/edicoes.json', dir), 'utf8'));
  for (const slug of Object.keys(manifest)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Error('Invalid article slug');
    const record = JSON.parse(await readFile(new URL('editorial/records/' + slug + '.json', import.meta.url), 'utf8'));
    if (record.slug !== slug || !['approved','published','updated'].includes(record.content_status)) throw Error('Non-public article');
    const fields = ['slug','title','summary','what_changed','who_is_affected','how_to_adapt','brazil_note','limitations','business_opportunity','opportunity_status','updated_at'];
    const context = Object.fromEntries(fields.map(key => [key, record[key]]));
    context.sources = record.sources.map(({title,url}) => ({title,url}));
    await writeFile(new URL('observatorio/' + slug + '/context.json', dir), JSON.stringify(context));
  }
}

// Attach the shared HUD to the public legacy HTML produced by the static build.
async function attachPublicHud(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['crm', '_astro', 'teardown'].includes(entry.name)) continue;
    const url = new URL(encodeURIComponent(entry.name) + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) await attachPublicHud(url, prefix + entry.name + '/');
    else if (entry.name.endsWith('.html')) {
      let html = await readFile(url, 'utf8');
      if (/^(?:n1|drops|tuning|tunning|raio-x-vendas|estudos|horoscopo|klein)\//.test(prefix) && !html.includes('/assets/product-tools.css')) {
        html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="/assets/product-tools.css"></head>');
        await writeFile(url, html);
      }
      if (prefix === 'solucoes/' && entry.name === 'index.html') {
        const email = process.env.PUBLIC_CONTACT_EMAIL || '';
        if (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) {
          html = html.replace('<a class="secondary-link" id="contact-email" hidden>', '<a class="secondary-link" id="contact-email" href="mailto:' + encodeURIComponent(email).replace('%40','@') + '">');
          await writeFile(url, html);
        }
      }
      if (!html.includes('/assets/command-hud.js')) {
        const assets = '<link rel="stylesheet" href="/assets/command-hud.css"><script defer src="/assets/command-hud.js"></script>';
        await writeFile(url, html.replace(/<\/head>/i, assets + '</head>'));
      }
    }
  }
}

export default defineConfig({
  site: 'https://verticelabs.me',
  trailingSlash: 'always',
  vite: { plugins: [tailwindcss()] },
  integrations: [{
    name: 'vertice-legacy-routes',
    hooks: {
      'astro:config:setup': ({ addRenderer }) => addRenderer({
        name: 'vertice-native-diagnostic',
        serverEntrypoint: fileURLToPath(new URL('./src/renderers/diagnostic-server.mjs', import.meta.url)),
        clientEntrypoint: fileURLToPath(new URL('./src/renderers/diagnostic-client.mjs', import.meta.url)),
      }),
      'astro:build:done': async ({ dir }) => {
        await Promise.all(legacyPaths.map((path) => cp(
          new URL(path, import.meta.url), new URL(path, dir),
          { recursive: true, filter: (source) => !source.endsWith('/vision-worker') },
        )));
        await cp(new URL('index.html', import.meta.url), new URL('pt/catalogo/index.html', dir), { recursive: true });
        await buildArticleContexts(dir);
        await attachPublicHud(dir);
      },
    },
  }],
});
