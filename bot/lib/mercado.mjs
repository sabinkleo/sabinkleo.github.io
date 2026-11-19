import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as esperar } from 'node:timers/promises';
import { gravar, raiz } from './arquivos.mjs';

const campos = ['t','o','h','l','c','v','fonte'];

function verificarVela(b, passo) {
  if (!Number.isSafeInteger(b.t) || b.t % passo || ![b.o,b.h,b.l,b.c,b.v].every(Number.isFinite)
      || b.l <= 0 || b.l > Math.min(b.o,b.c) || b.h < Math.max(b.o,b.c) || b.v < 0
      || !['v5','grafico_spot'].includes(b.fonte)) throw Error('Candle inválido da Bybit em ' + b.t);
}

// A janela precisa ser contínua nos três pares para que bot e hold tenham os mesmos preços e horários.
function validarJanela(barras, inicio, fim, passo) {
  if (barras.length !== (fim - inicio) / passo) throw Error('Janela incompleta da Bybit em ' + new Date(inicio).toISOString());
  barras.forEach((b, i) => {
    verificarVela(b, passo);
    if (b.t !== inicio + i * passo) throw Error('Candle duplicado ou lacuna em ' + b.t);
  });
}

export function coletor(cfg, requisitar = fetch) {
  // Um 403 da v5 vale para o restante desta execução. A próxima execução começa pela v5 outra vez.
  let v5Indisponivel = false;
  async function pagina(fonte, par, inicio, fim) {
    const v5 = fonte === 'v5';
    const url = new URL(cfg.mercado[fonte]);
    const minutos = cfg.intervalo_minutos;
    const intervaloWeb = minutos % 60 === 0 ? minutos / 60 + 'h' : minutos + 'm';
    const limite = String((fim - inicio) / cfg.passo);
    const consulta = v5 ? {category:'spot',symbol:par,interval:String(minutos),start:inicio,end:fim-1,limit:limite}
      : {symbol:par,interval:intervaloWeb,from:inicio,to:fim-1,limit:limite};
    url.search = new URLSearchParams(consulta);
    for (let i = 0; i < cfg.mercado.tentativas; i++) {
      try {
        const r = await requisitar(url, {signal:AbortSignal.timeout(cfg.mercado.timeout_ms)});
        if (!r.ok) throw Object.assign(Error('HTTP ' + r.status), {status:r.status});
        const j = await r.json();
        if ((v5 ? j.retCode : j.ret_code) !== 0) throw Error('Bybit recusou os candles: ' + (j.retMsg || j.ret_msg));
        if (v5 && (j.result.category !== 'spot' || j.result.symbol !== par)) throw Error('Mercado inesperado');
        const linhas = v5 ? j.result.list : j.result;
        const barras = linhas.map(b => {
          if (!v5 && b.s !== par) throw Error('Par inesperado');
          const valores = v5 ? b.slice(0,6) : [b.t,b.o,b.h,b.l,b.c,b.v];
          if (valores.length !== 6 || valores.some(v => v == null || String(v).trim() === '')) throw Error('Candle sem campo numérico');
          const [t,o,h,l,c,v] = valores.map(Number);
          return {t,o,h,l,c,v,fonte};
        }).sort((a,b) => a.t-b.t);
        validarJanela(barras,inicio,fim,cfg.passo);
        return barras;
      } catch (erro) {
        if (erro.status === 403 || i+1 === cfg.mercado.tentativas) throw erro;
        await esperar(1000 * 2 ** i);
      }
    }
  }
  async function buscar(par, inicio, fim) {
    if (!v5Indisponivel) {
      try { return await pagina('v5',par,inicio,fim); }
      catch (erro) {
        if (!cfg.mercado.grafico_spot) throw erro;
        if (erro.status === 403) v5Indisponivel = true;
        console.warn('Bybit v5, ' + par + ': ' + erro.message + '. Consultando o gráfico spot oficial.');
      }
    }
    return pagina('grafico_spot',par,inicio,fim);
  }
  return {
    async historico(par, fim) {
      const caminho = raiz + 'data/' + par + '-' + cfg.intervalo_minutos + 'm.csv';
      let barras = [];
      if (existsSync(caminho)) {
        const [cab,...linhas] = readFileSync(caminho,'utf8').trimEnd().split('\n');
        if (cab !== campos.join(',')) throw Error('Cabeçalho inválido em ' + caminho);
        barras = linhas.map(l => {
          const partes = l.split(',');
          if (partes.length !== campos.length || partes.some(v => !v.trim())) throw Error('CSV incompleto: ' + caminho);
          return Object.fromEntries(campos.map((k,i) => [k, k === 'fonte' ? partes[i] : Number(partes[i])]));
        });
        if (barras.length) validarJanela(barras,barras[0].t,barras.at(-1).t+cfg.passo,cfg.passo);
      }
      // Aproveita a interseção com o cache, inclusive quando o início da configuração muda.
      const cache = new Map(barras.map(b => [b.t,b]));
      let mudou = false;
      for (let t = cfg.inicio; t < fim;) {
        if (cache.has(t)) { t += cfg.passo; continue; }
        let ate = t + cfg.passo;
        while (ate < fim && !cache.has(ate) && ate-t < cfg.mercado.limite_pagina*cfg.passo) ate += cfg.passo;
        for (const b of await buscar(par,t,ate)) cache.set(b.t,b);
        t = ate; mudou = true;
      }
      const ordenadas = [...cache.values()].sort((a,b) => a.t-b.t);
      const janela = ordenadas.filter(b => b.t >= cfg.inicio && b.t < fim);
      validarJanela(janela,cfg.inicio,fim,cfg.passo);
      if (mudou) {
        // Uma mudança de período pode produzir duas ilhas. Só persistimos uma série contínua.
        const salvar = ordenadas.every((b,i) => !i || b.t === ordenadas[i-1].t+cfg.passo) ? ordenadas : janela;
        gravar(caminho,[campos.join(','),...salvar.map(b => campos.map(k => b[k]).join(','))].join('\n')+'\n');
      }
      return janela;
    },
    // Do candle em formação só sai a abertura. Máxima, mínima, volume e fechamento ainda mudam.
    async abertura(par,t) {
      const [b] = await buscar(par,t,t+cfg.passo);
      return {t:b.t,o:b.o,fonte:b.fonte};
    }
  };
}
