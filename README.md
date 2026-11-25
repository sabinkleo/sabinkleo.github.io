# Vértice Labs

Static GitHub Pages site for `https://verticelabs.me/`.

## Routes

- `/` — extensible Vértice Labs module catalog.
- `/n1/` — local inventory, movements and reconciliation across five stockroom profiles. The page includes a downloadable offline HTML and two demonstration rounds.
- [Guia da equipe N1](https://verticelabs.me/n1/equipe/) — Portuguese instructions, two independent practice tasks with CSV handoffs, and a guide to working on the same stockroom dataset.
- [N1 Visão](https://verticelabs.me/n1/visao/) — QR shelf checks and an optional [on-device photo comparison](https://verticelabs.me/n1/visao/fotos/). Photo comparison downloads TensorFlow.js and MobileNet V1 on demand and runs inference on the browser's CPU backend.
- `/tuning/` — automotive pre-dyno intake tool.
- `/tunning/` — compatibility redirect to `/tuning/`.

The site preserves `CNAME` for `verticelabs.me` and has no build step. The inventory core is self-contained. The tuning module keeps its configured WhatsApp
destination, performs all assessment locally in the browser, and does not
claim that a WhatsApp click is a confirmed sale or qualified lead.

- `/privacy/` — OPSEC Lab: an educational, client-side-only browser signal inspection and self-assessed privacy checklist. No external JS, analytics pixel, backend, cookies, or persistence on this module. Results are not transmitted by its script; regular hosting requests remain possible.

## Local verification

From the repository root:

```powershell
python -m http.server 8000
```

Open `/`, `/n1/`, `/tuning/`, and `/tunning/` on the local server. In N1, each warehouse demo round starts with 20 items, three discrepancies and 17 matches. The demo and personal inventory have separate storage for each profile. A JSON backup can move inventory between the website and the offline copy. The source module
contains no analytics IDs; do not add tracking IDs or customer data without
approval.

## Vértice Intelligence

[`/observatorio/`](https://verticelabs.me/observatorio/) reúne guias e matérias com fontes, histórico editorial e ferramentas relacionadas. A [operação editorial](editorial/README.md) descreve a entrada do radar, a geração local, as verificações e a revisão dos pacotes de mídia.

## Mensuração opcional

O [guia de configuração e teste](ops/MEASUREMENT_SETUP.md) descreve o contêiner GTM, os eventos permitidos e a validação antes da publicação.

## Prévia V2

Na branch `feat/vertice-v2`, use `npm ci`, `npm run build` e `npm run preview`.
Abra a URL local exibida pelo preview. A pasta `dist/` combina a nova home
Astro/Tailwind com as páginas e os arquivos estáticos existentes. A home HTML
da raiz continua sendo a entrada usada pelo fluxo legado do GitHub Pages.
Esta branch não configura publicação.

Para verificar a integração opcional em `/control/`, copie `.env.example`
para `.env` antes de executar o build. O acesso requer uma sessão existente
no Appwrite e acesso à equipe indicada pelo ID em `PUBLIC_APPWRITE_OPERATOR_TEAM_ID`.
Registre a origem da prévia no Appwrite para permitir essa consulta. A interface
é estática e contém apenas dados de demonstração. Permissões de dados reais
devem continuar no backend.

`PUBLIC_VERTICE_AI_URL` recebe a URL base pública do Worker. A verificação
manual da prévia usa `GET /health` relativo a essa base, com CORS para a origem
da prévia. Sem a variável, o botão fica desativado. As integrações próprias dos
módulos legados, incluindo o verificador N1, mantêm a configuração existente.
