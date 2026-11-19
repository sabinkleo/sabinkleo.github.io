import { existsSync } from 'node:fs';
import lockfile from 'proper-lockfile';
import { configuracao, gravar, gravarJson, lerJson, raiz } from './lib/arquivos.mjs';
import { coletor } from './lib/mercado.mjs';
import { backtest, iso } from './lib/motor.mjs';
import { assinatura, atualizarPaper, painelPaper } from './lib/paper.mjs';

function publicarPaper(estado,cfg) {
  // O JSON de estado é a fonte de verdade. Uma repetição também reconstitui os dois arquivos derivados.
  const linhas = estado.trades.map(x => [iso(x.t),x.lado,x.par,x.acao,x.quantidade,x.preco,x.taxa].join(','));
  gravar(raiz+'state/trades.csv',['abertura_utc,carteira,par,acao,quantidade,preco_usdt,taxa_usdt',...linhas].join('\n')+'\n');
  gravarJson(raiz+'results/paper.json',painelPaper(estado,cfg));
}
async function rodar(modo) {
  if (!['backtest','paper'].includes(modo)) throw Error('Use npm run backtest ou npm run paper na pasta bot.');
  const {cfg,regras} = configuracao(), contrato = assinatura(cfg,regras);
  const mercado = coletor(cfg);
  const aberturaAtual = Math.floor(Date.now()/cfg.passo)*cfg.passo;
  const fim = modo === 'backtest' && cfg.fim_utc
    ? Math.min(aberturaAtual,Math.floor(Date.parse(cfg.fim_utc)/cfg.passo)*cfg.passo) : aberturaAtual;
  const arquivoEstado = raiz+'state/paper_state.json';
  const anterior = modo === 'paper' && existsSync(arquivoEstado) ? lerJson(arquivoEstado) : null;
  const arquivoBacktest = raiz+'results/backtest.json';
  const bt = modo === 'paper' ? lerJson(arquivoBacktest) : null;
  if (bt && bt.contrato !== contrato) throw Error('Configuração diferente da usada no backtest.');
  if (anterior?.ultima_abertura === aberturaAtual) {
    atualizarPaper(anterior,{}, {},aberturaAtual,cfg,bt.estrategia,contrato);
    publicarPaper(anterior,cfg);
    console.log('Abertura já processada em '+iso(aberturaAtual));
    return;
  }
  const dados = {};
  for (const p of cfg.pares) dados[p] = await mercado.historico(p,fim);
  if (modo === 'backtest') {
    const r = {...backtest(dados,cfg,regras),contrato};
    const linhas = ['amostra,instante_utc,bot_usdt,hold_usdt'];
    for (const fase of ['treino','teste']) for (const v of r[fase].curva) linhas.push([fase,iso(v.t),v.bot,v.hold].join(','));
    gravar(raiz+'results/patrimonio.csv',linhas.join('\n')+'\n');
    gravar(raiz+'results/veredito.txt',r.veredito+'\n');
    gravarJson(arquivoBacktest,r);
    console.log(r.veredito);
    return;
  }
  const aberturas = {};
  for (const p of cfg.pares) aberturas[p] = await mercado.abertura(p,aberturaAtual);
  const estado = atualizarPaper(anterior,dados,aberturas,aberturaAtual,cfg,bt.estrategia,contrato);
  gravarJson(arquivoEstado,estado);
  publicarPaper(estado,cfg);
  console.log('Carteiras salvas em '+iso(aberturaAtual)+'. Fonte: '+Object.values(estado.ultimas_fontes).join(', '));
}

// O bloqueio entre processos é liberado na saída e expira após interrupções abruptas.
try {
  const liberar = await lockfile.lock(raiz,{retries:{retries:20,minTimeout:250,maxTimeout:1000}});
  try { await rodar(process.argv[2]); } finally { await liberar(); }
} catch (erro) {
  console.error('[' + new Date().toISOString() + '] Falha no duelo: ' + erro.message);
  process.exitCode = 1;
}
