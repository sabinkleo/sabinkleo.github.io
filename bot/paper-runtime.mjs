import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assinatura } from './lib/paper.mjs';
import { arquivosPaper, sha256, verificarCheckpoint } from './lib/paper-checkpoint.mjs';

const ler = caminho => readFileSync(caminho, 'utf8').replaceAll('\r\n', '\n');
const salvar = (caminho, texto) => {
  mkdirSync(dirname(caminho), {recursive:true});
  writeFileSync(caminho, texto);
};

export function restaurarCache(runtime, trabalho, arquivo) {
  const seed = ler(join(runtime, 'seed', arquivo));
  const pasta = join(runtime, 'journal', arquivo);
  const dias = existsSync(pasta) ? readdirSync(pasta).sort() : [];
  if (dias.some(dia => !/^\d{4}-\d{2}-\d{2}\.csv$/.test(dia))) throw Error('Arquivo inesperado no journal');
  const texto = seed + dias.map(dia => ler(join(pasta, dia))).join('');
  salvar(join(trabalho, arquivo), texto);
  return texto;
}

export function registrarCache(runtime, arquivo, anterior, atual) {
  if (!atual.startsWith(anterior) || !atual.endsWith('\n')) {
    throw Error('O mercado alterou o histórico existente: ' + arquivo);
  }
  const dias = new Map();
  for (const linha of atual.slice(anterior.length).trimEnd().split('\n').filter(Boolean)) {
    const dia = new Date(Number(linha.split(',', 1)[0])).toISOString().slice(0, 10) + '.csv';
    dias.set(dia, (dias.get(dia) ?? '') + linha + '\n');
  }
  for (const [dia, linhas] of dias) {
    const caminho = join(runtime, 'journal', arquivo, dia);
    salvar(caminho, (existsSync(caminho) ? ler(caminho) : '') + linhas);
  }
}

function copiarPaper(origem, destino) {
  for (const arquivo of arquivosPaper) {
    const caminho = join(destino, arquivo);
    mkdirSync(dirname(caminho), {recursive:true});
    cpSync(join(origem, arquivo), caminho);
  }
}

function gravarManifesto(runtime, bot, origem, cfg, contrato) {
  const lerPaper = p => readFileSync(join(bot,p));
  const hashes = Object.fromEntries(arquivosPaper.map(p => [p, sha256(lerPaper(p))]));
  const estado = verificarCheckpoint(lerPaper, hashes, cfg, contrato);
  salvar(join(runtime,'checkpoint.json'), JSON.stringify({
    origem, hashes, contrato, abertura:estado.ultima_abertura, estrategia:estado.estrategia
  }, null, 2) + '\n');
}

async function executar(modo, runtime, origem) {
  const { configuracao } = await import('./lib/arquivos.mjs');
  const {cfg,regras} = configuracao();
  const contrato = assinatura(cfg,regras);
  const trabalho = fileURLToPath(new URL('.', import.meta.url));
  const bot = join(runtime, 'bot');
  const arquivos = cfg.pares.map(par => par + '-' + cfg.intervalo_minutos + 'm.csv');
  const cache = join(trabalho, 'data');
  const manifesto = join(runtime, 'checkpoint.json');
  if (modo === 'seed') {
    if (existsSync(manifesto) || !/^[a-f0-9]{40}$/.test(origem ?? '')) throw Error('Seed existente ou origem inválida');
    copiarPaper(trabalho, bot);
    for (const arquivo of arquivos) salvar(join(runtime,'seed',arquivo), ler(join(cache,arquivo)));
    gravarManifesto(runtime,bot,origem,cfg,contrato);
    return;
  }

  const checkpoint = JSON.parse(ler(manifesto));
  const estado = verificarCheckpoint(p => readFileSync(join(bot,p)), checkpoint.hashes, cfg, contrato);
  if (checkpoint.abertura !== estado.ultima_abertura || checkpoint.contrato !== estado.contrato
    || JSON.stringify(checkpoint.estrategia) !== JSON.stringify(estado.estrategia)) {
    throw Error('Manifesto e estado divergem');
  }
  if (modo === 'restore') {
    copiarPaper(bot, trabalho);
    for (const arquivo of arquivos) restaurarCache(runtime,cache,arquivo);
    return;
  }
  if (modo !== 'record') throw Error('Modo runtime desconhecido');
  const verifyCache = join(runtime, '..', 'previous-cache');
  for (const arquivo of arquivos) {
    const anterior = restaurarCache(runtime,verifyCache,arquivo);
    registrarCache(runtime,arquivo,anterior,ler(join(cache,arquivo)));
  }
  copiarPaper(trabalho, bot);
  gravarManifesto(runtime,bot,checkpoint.origem,cfg,contrato);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) await executar(...process.argv.slice(2));
