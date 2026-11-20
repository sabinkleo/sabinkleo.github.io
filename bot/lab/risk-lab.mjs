// Laboratório isolado: não altera o estado nem as ordens do paper trading.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serieDeAlvos } from '../lib/motor.mjs';

const dir = dirname(fileURLToPath(import.meta.url));

export function atrSerie(barras, n) {
  if (!Number.isInteger(n) || n < 2) throw Error('Período ATR inválido');
  let media = null, soma = 0;
  return barras.map((b, i) => {
    const tr = i === 0 ? b.h - b.l : Math.max(
      b.h - b.l, Math.abs(b.h - barras[i - 1].c), Math.abs(b.l - barras[i - 1].c));
    if (i < n) { soma += tr; if (i === n - 1) media = soma / n; }
    else media = (media * (n - 1) + tr) / n;
    return media;
  });
}

export function simularComRisco(dados, cfg, estrategia, parametros, inicio, fim, sinaisSobrescritos=null) {
  const pares = Object.keys(dados);
  if (!pares.length) throw Error('Sem pares');
  const n = dados[pares[0]].length;
  if (n < fim || inicio < 1 || fim <= inicio ||
      pares.some(p => dados[p].length !== n)) throw Error('Janela inválida');
  const p = parametros;
  for (const k of ['risco_por_trade','exposicao_maxima','stop_atr','alvo_atr','adicional_atr','trailing_atr','custo_minimo_extra']) {
    if (!Number.isFinite(p[k]) || p[k] < 0) throw Error('Parâmetro inválido: ' + k);
  }
  if (!(p.risco_por_trade > 0 && p.risco_por_trade <= 0.05 && p.exposicao_maxima > 0 && p.exposicao_maxima <= 1 &&
    p.stop_atr > 0 && p.alvo_atr > p.stop_atr && p.trailing_atr > 0 &&
    Number.isInteger(p.atr_periodo) && p.atr_periodo >= 2 &&
    Number.isInteger(p.cooldown_barras) && p.cooldown_barras >= 0)) throw Error('Limites de risco inválidos');
  const taxa = cfg.taxa, slip = cfg.slippage;
  if (![taxa, slip].every(x => Number.isFinite(x) && x >= 0 && x < 0.1)) throw Error('Custos inválidos');

  const porPar = cfg.capital / pares.length;
  const estados = Object.fromEntries(pares.map(par => [par, {
    caixa: porPar, quantidade: 0, precoEntrada: 0, stop: 0, alvo: 0,
    cotasPlanejadas: 0, entrou: -1, cooling: -1, parcial: false,
    maxFechamento: 0, custos: 0, operacoes: 0, stops: 0, alvos: 0
  }]));
  const sinais = sinaisSobrescritos ?? Object.fromEntries(pares.map(par => [par, serieDeAlvos(dados[par], estrategia)]));
  if (pares.some(par => !Array.isArray(sinais[par]) || sinais[par].length !== n)) throw Error('Sinais inválidos');
  const vol = Object.fromEntries(pares.map(par => [par, atrSerie(dados[par], p.atr_periodo)]));
  const curva = [{t: dados[pares[0]][inicio].t, patrimonio: cfg.capital}];
  const operacoes = [];

  function transacionar(e, par, tipo, quantidade, preco, t, motivo) {
    if (!(quantidade > 0) || !(preco > 0)) return false;
    const fill = preco * (tipo === 'compra' ? 1 + slip : 1 - slip);
    const bruto = quantidade * fill, fee = bruto * taxa;
    if (tipo === 'compra') {
      if (bruto + fee > e.caixa + 1e-7) throw Error('Caixa insuficiente');
      e.caixa -= bruto + fee;
      e.quantidade += quantidade;
    } else {
      if (quantidade > e.quantidade + 1e-9) throw Error('Posição insuficiente');
      e.caixa += bruto - fee;
      e.quantidade -= quantidade;
      if (e.quantidade < 1e-10) e.quantidade = 0;
    }
    e.custos += fee; e.operacoes++;
    operacoes.push({t, par, tipo, motivo, quantidade, preco: fill, taxa: fee});
    return true;
  }
  const precos = i => Object.fromEntries(pares.map(par => [par, dados[par][i].c]));
  function patrimonio(valores) {
    return pares.reduce((s,par) => {
      const e=estados[par]; return s+e.caixa+e.quantidade*valores[par];
    },0);
  }

  const passo=dados[pares[0]][1].t-dados[pares[0]][0].t;
  for (let i=inicio;i<fim;i++) {
    for (const par of pares) {
      const b=dados[par][i], e=estados[par], anterior=sinais[par][i-1]===1;
      const a=vol[par][i-1]; // ATR conhecido somente até o fechamento anterior.
      const t=b.t;

      // O sinal do fechamento anterior só vira execução na próxima abertura.
      if (e.quantidade > 0 && !anterior) {
        transacionar(e,par,'venda',e.quantidade,b.o,t,'reversao');
        e.cooling=i+p.cooldown_barras+1;
      }
      if (e.quantidade === 0 && anterior && i >= e.cooling && a != null && a > 0) {
        const distancia=p.stop_atr*a;
        const custoRoundtrip=2*(taxa+slip) + p.custo_minimo_extra;
        if ((p.alvo_atr*a)/b.o > custoRoundtrip && distancia/b.o < 0.5) {
          const capitalRisco=porPar*p.risco_por_trade;
          const nocional=Math.min(p.exposicao_maxima*porPar,capitalRisco*b.o/(distancia+b.o*2*(taxa+slip)));
          const lote=nocional/2, custoUnit=b.o*(1+slip)*(1+taxa);
          const qty=Math.min(lote/custoUnit,e.caixa/custoUnit);
          if (transacionar(e,par,'compra',qty,b.o,t,'entrada-1')) {
            e.precoEntrada=b.o*(1+slip);
            e.stop=e.precoEntrada-distancia;
            e.alvo=e.precoEntrada+p.alvo_atr*a;
            e.cotasPlanejadas=nocional;
            e.entrou=i; e.parcial=false; e.maxFechamento=b.c;
          }
        }
      } else if (e.quantidade>0 && anterior && !e.parcial && i>e.entrou && e.cotasPlanejadas>0 &&
          a!=null && b.o >= e.precoEntrada+p.adicional_atr*a) {
        // Segunda compra escalonada. Não aumenta o nocional-alvo planejado.
        const invested=e.quantidade*b.o;
        const gasto=Math.min(e.cotasPlanejadas/2, Math.max(0,e.cotasPlanejadas-invested));
        const unidade=b.o*(1+slip)*(1+taxa);
        const qty=Math.min(gasto/unidade,e.caixa/unidade);
        if (transacionar(e,par,'compra',qty,b.o,t,'entrada-2')) e.cotasPlanejadas=0;
      }

      if (e.quantidade>0) {
        // OHLC não informa a ordem intrabar: stop vence quando stop e alvo coincidem.
        // Em gap além do stop, executa na abertura piorada por slippage.
        if (b.o <= e.stop || b.l <= e.stop) {
          const preco=b.o<=e.stop?b.o:e.stop;
          transacionar(e,par,'venda',e.quantidade,preco,t,'stop');
          e.stops++;e.cooling=i+p.cooldown_barras+1;
        } else if (!e.parcial && b.h >= e.alvo) {
          transacionar(e,par,'venda',e.quantidade/2,e.alvo,t,'parcial');
          e.parcial=true;e.alvos++;
          e.cotasPlanejadas=0;
        }
        if (e.quantidade>0) {
          // Trailing calculado após o fechamento; só vale a partir do próximo candle.
          e.maxFechamento=Math.max(e.maxFechamento,b.c);
          if(a!=null) e.stop=Math.max(e.stop,e.maxFechamento-p.trailing_atr*a);
        }
      }
    }
    curva.push({t:dados[pares[0]][i].t+passo,patrimonio:patrimonio(precos(i))});
  }

  let topo=cfg.capital, dd=0;
  for(const pt of curva){topo=Math.max(topo,pt.patrimonio);dd=Math.max(dd,1-pt.patrimonio/topo);}
  return {
    resultados:{
      patrimonio: curva.at(-1).patrimonio,
      retorno_pct:(curva.at(-1).patrimonio/cfg.capital-1)*100,
      drawdown_max_pct:dd*100,
      operacoes:operacoes.length,
      taxas:pares.reduce((v,par)=>v+estados[par].custos,0),
      stops:pares.reduce((v,par)=>v+estados[par].stops,0),
      realizacoes_parciais:pares.reduce((v,par)=>v+estados[par].alvos,0)
    },
    operacoes,curva
  };
}

function carregar() {
  const cfg=JSON.parse(readFileSync(join(dir,'../results/backtest.json'),'utf8'));
  const params=JSON.parse(readFileSync(join(dir,'params.json'),'utf8'));
  const dados={};
  for(const par of cfg.pares) {
    const txt=readFileSync(join(dir,'../data',par+'-'+cfg.intervalo_minutos+'m.csv'),'utf8').trim();
    const [cab,...rows]=txt.split(/\r?\n/);
    if(cab!=='t,o,h,l,c,v,fonte') throw Error('CSV não reconhecido');
    dados[par]=rows.map(row=>{
      const [t,o,h,l,c,v]=row.split(',').map(Number);
      return {t,o,h,l,c,v};
    });
  }
  const serie=dados[cfg.pares[0]], ind=serie.findIndex(b=>b.t===cfg.teste.inicio);
  if(ind<1 || cfg.pares.some(par=>dados[par].length!==serie.length ||
      dados[par].some((b,i)=>b.t!==serie[i].t)) ||
      serie.some((b,i)=>i && b.t-serie[i-1].t!==cfg.intervalo_minutos*60000)) throw Error('Dados ou corte inválidos');
  return {cfg,params,dados,ind,campos:{capital:cfg.capital,taxa:cfg.taxa,slippage:cfg.slippage}};
}

if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const {cfg,params,dados,ind,campos}=carregar();
  const warm=Math.max(cfg.estrategia.ema_lenta,params.atr_periodo)+2;
  // A janela anteriormente "reservada" já foi vista. Esta avaliação é exploratória.
  const treino=simularComRisco(dados,campos,cfg.estrategia,params,warm,ind);
  const teste=simularComRisco(dados,campos,cfg.estrategia,params,ind,dados[cfg.pares[0]].length);
  console.log(JSON.stringify({
    aviso:'Comparação exploratória; o teste original não está mais intocado para novas hipóteses.',
    treino:treino.resultados,teste:teste.resultados
  },null,2));
}