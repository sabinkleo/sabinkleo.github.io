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

// Attach the shared HUD to the public legacy HTML produced by the static build.
async function attachPublicHud(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'crm' || entry.name === '_astro') continue;
    const url = new URL(encodeURIComponent(entry.name) + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) await attachPublicHud(url);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(url, 'utf8');
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
        await attachPublicHud(dir);
      },
    },
  }],
});
