import { ema, rsi } from '../../radar-ia-cripto/js/indicadores.js';

// O mesmo cálculo do Radar usa apenas valores passados. Cada alvo pertence ao FECHAMENTO indicado.
export function serieDeAlvos(candlesAteT, regras) {
  const fechamentos = candlesAteT.map(b => b.c);
  const rapida = ema(fechamentos,regras.ema_rapida);
  const lenta = ema(fechamentos,regras.ema_lenta);
  const forca = rsi(fechamentos,regras.rsi_periodo);
  let alvo = 0;
  return fechamentos.map((_,i) => {
    if (i === 0 || lenta[i-1] === null || forca[i] === null) return alvo;
    const antigo = rapida[i-1] - lenta[i-1], atual = rapida[i] - lenta[i];
    const cruzou = antigo <= 0 && atual > 0 ? 'acima' : antigo >= 0 && atual < 0 ? 'abaixo' : null;
    if (cruzou === regras.saida.cruzamento) alvo = 0;
    if (cruzou === regras.entrada.cruzamento && forca[i] >= regras.entrada.rsi_minimo) alvo = 1;
    return alvo;
  });
}
export const estrategia = regras => candlesAteT => serieDeAlvos(candlesAteT,regras).at(-1) ?? 0;
export const lados = ['bot','hold'];
export const arred = x => Number(x.toFixed(8));
export const iso = t => new Date(t).toISOString();

export function novoDuelo(cfg) {
  const carteiras = {};
  for (const lado of lados) {
    carteiras[lado] = Object.fromEntries(cfg.pares.map(p => [p,{
      caixa:cfg.saldo_inicial_usdt/cfg.pares.length, quantidade:0, taxas:0, operacoes:0
    }]));
  }
  return {carteiras, curva:[], trades:[], exposicao:{bot:0,hold:0}, intervalos:0};
}

// A compra reserva o custo da taxa antes de definir a quantidade. A venda liquida só o saldo em spot.
export function executar(conta, alvo, abertura, cfg) {
  if (Boolean(conta.quantidade) === Boolean(alvo)) return null;
  const preco = abertura * (1 + (alvo ? 1 : -1) * cfg.slippage_por_execucao);
  const quantidade = alvo ? conta.caixa / (1+cfg.taxa_por_execucao) / preco : conta.quantidade;
  const bruto = quantidade * preco, taxa = bruto * cfg.taxa_por_execucao;
  conta.caixa = alvo ? 0 : bruto - taxa;
  conta.quantidade = alvo ? quantidade : 0;
  conta.taxas += taxa;
  conta.operacoes++;
  return {acao:alvo ? 'compra' : 'venda',preco,quantidade,taxa};
}
export function negociar(duelo, cfg, t, aberturas, alvos) {
  for (const lado of lados) for (const par of cfg.pares) {
    const op = executar(duelo.carteiras[lado][par],lado === 'hold' ? 1 : alvos[par],aberturas[par],cfg);
    if (op) duelo.trades.push({t,lado,par,...op});
  }
}

// A exposição mede a fração média das carteiras por par que passou o intervalo comprada.
export function passarIntervalo(duelo,cfg) {
  for (const lado of lados) {
    duelo.exposicao[lado] += cfg.pares.filter(p => duelo.carteiras[lado][p].quantidade > 0).length/cfg.pares.length;
  }
  duelo.intervalos++;
}
export function marcar(duelo,cfg,t,precos) {
  const ponto = {t};
  for (const lado of lados) {
    ponto[lado] = arred(cfg.pares.reduce((v,p) => {
      const c = duelo.carteiras[lado][p];
      return v + c.caixa + c.quantidade * precos[p];
    },0));
  }
  duelo.curva.push(ponto);
}
export function metricas(duelo,cfg) {
  const res = {};
  for (const lado of lados) {
    let pico = cfg.saldo_inicial_usdt, anterior = pico, dd = 0;
    const retornos = [];
    for (const [i,p] of duelo.curva.entries()) {
      pico = Math.max(pico,p[lado]);
      dd = Math.max(dd,1-p[lado]/pico);
      // Na primeira abertura ainda não transcorreu uma hora. O primeiro retorno inclui os custos iniciais.
      if (i > 0 && p.t > duelo.curva[i-1].t) {
        retornos.push(p[lado]/anterior-1);
        anterior = p[lado];
      }
    }
    const media = retornos.reduce((a,b) => a+b,0)/retornos.length;
    const variancia = retornos.reduce((a,b) => a+(b-media)**2,0)/(retornos.length-1);
    const contas = Object.values(duelo.carteiras[lado]);
    res[lado] = {
      patrimonio_usdt:duelo.curva.at(-1)[lado],
      retorno_pct:arred((duelo.curva.at(-1)[lado]/cfg.saldo_inicial_usdt-1)*100),
      drawdown_max_pct:arred(dd*100),
      sharpe:retornos.length >= 2 && variancia > 0 ? arred(media/Math.sqrt(variancia)*Math.sqrt(cfg.dias_por_ano*86400000/cfg.passo)) : null,
      trades:contas.reduce((a,b) => a+b.operacoes,0),
      tempo_em_posicao_pct:duelo.intervalos ? arred(duelo.exposicao[lado]/duelo.intervalos*100) : null,
      taxas_usdt:arred(contas.reduce((a,b) => a+b.taxas,0))
    };
  }
  for (const lado of lados) res[lado].diferenca_hold_pp = arred(res[lado].retorno_pct-res.hold.retorno_pct);
  return res;
}
export function resumo(duelo,cfg) {
  return {inicio:duelo.curva[0].t,fim:duelo.curva.at(-1).t,intervalos:duelo.intervalos,
    metricas:metricas(duelo,cfg),curva:duelo.curva,ultimas_operacoes:duelo.trades.filter(v => v.lado === 'bot').slice(-12).reverse()};
}
export function veredito(res, periodo) {
  const delta = res.metricas.bot.diferenca_hold_pp;
  const frase = delta === 0 ? 'Bot e hold empataram' : delta > 0 ? 'O bot venceu o hold' : 'O hold venceu o bot';
  const valor = Math.abs(delta).toLocaleString('pt-BR',{maximumFractionDigits:2});
  return frase + ' ' + periodo + (delta ? ' por ' + valor + ' p.p.' : '.') + ' A amostra é pequena.';
}

export function simular(dados,cfg,regras,inicio,fim) {
  const duelo = novoDuelo(cfg), relogio = dados[cfg.pares[0]];
  // O último fechamento da janela não pode virar execução nessa mesma janela.
  const alvos = Object.fromEntries(cfg.pares.map(p => [p,serieDeAlvos(dados[p].slice(0,fim-1),regras)]));
  duelo.curva.push({t:relogio[inicio].t,bot:cfg.saldo_inicial_usdt,hold:cfg.saldo_inicial_usdt});
  for (let i=inicio; i<fim; i++) {
    const valores = campo => Object.fromEntries(cfg.pares.map(p => [p,dados[p][i][campo]]));
    const sinais = Object.fromEntries(cfg.pares.map(p => [p,alvos[p][i-1] ?? 0]));
    negociar(duelo,cfg,relogio[i].t,valores('o'),sinais);
    passarIntervalo(duelo,cfg);
    marcar(duelo,cfg,relogio[i].t+cfg.passo,valores('c'));
  }
  return duelo;
}

export function backtest(dados,cfg,regras) {
  const n = dados[cfg.pares[0]].length, corte = Math.floor(n*cfg.fracao_treino);
  if (corte <= Math.max(regras.ema_lenta,regras.rsi_periodo)+1 || n-corte < 2) throw Error('Histórico curto para treino e teste.');
  const treino = Object.fromEntries(cfg.pares.map(p => [p,dados[p].slice(0,corte)]));
  let melhor, escolhida;
  const calibracao = [];
  // O ajuste não recebe o trecho de teste. O capital é reiniciado no corte, os indicadores continuam aquecidos.
  for (const minimo of regras.candidatos_rsi_minimo) {
    const candidata = {...regras,entrada:{...regras.entrada,rsi_minimo:minimo}};
    const r = resumo(simular(treino,cfg,candidata,0,corte),cfg);
    calibracao.push({rsi_minimo:minimo,retorno_treino_pct:r.metricas.bot.retorno_pct});
    if (!melhor || r.metricas.bot.retorno_pct > melhor.metricas.bot.retorno_pct) { melhor=r; escolhida=candidata; }
  }
  const teste = resumo(simular(dados,cfg,escolhida,corte,n),cfg);
  return {versao:1,pares:cfg.pares,intervalo_minutos:cfg.intervalo_minutos,capital:cfg.saldo_inicial_usdt,
    taxa:cfg.taxa_por_execucao,slippage:cfg.slippage_por_execucao,estrategia:escolhida,
    fontes:[...new Set(Object.values(dados).flat().map(b => b.fonte))],calibracao,treino:melhor,teste,
    veredito:veredito(teste,'no teste')};
}
