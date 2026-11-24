import { cp } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const legacyPaths = [
  'CNAME', 'robots.txt', 'analise-cripto', 'assets', 'bot/data', 'bot/history',
  'bot/results', 'bot/state', 'crm/config.json', 'crm/crm.mjs', 'crm/index.html',
  'crm/style.css', 'crm/transfer.mjs', 'drops', 'duelo-bot', 'estudos', 'horoscopo', 'klein',
  'n1', 'observatorio', 'perps', 'politica-de-privacidade', 'privacy',
  'radar-ia-cripto', 'raio-x-vendas', 'signal-lab', 'solucoes', 'tuning', 'tunning',
];

export default defineConfig({
  site: 'https://verticelabs.me',
  trailingSlash: 'always',
  vite: { plugins: [tailwindcss()] },
  integrations: [{
    name: 'vertice-legacy-routes',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await Promise.all(legacyPaths.map((path) => cp(
          new URL(path, import.meta.url), new URL(path, dir),
          { recursive: true, filter: (source) => !source.endsWith('/vision-worker') },
        )));
      },
    },
  }],
});
