import { criarGrafico } from './grafico.js';
import { numeroBR, horarioUTC, ROTULOS } from './leitura.js';
import { PERIODOS } from './mercado.js';

const porId = id => document.getElementById(id);
export const grafico = criarGrafico(porId('grafico'), porId('area-grafico'), porId('grafico-vazio'), porId('inspecao'));
function tag(nome, texto, classe) {
  const el = document.createElement(nome);
  el.textContent = texto;
  if (classe) el.className = classe;
  return el;
}

export function estado(titulo, detalhe, tipo) {
  porId('estado-titulo').dataset.estado = tipo;
  porId('estado-titulo').textContent = titulo;
  porId('estado-texto').textContent = detalhe;
  porId('mercado').setAttribute('aria-busy', String(tipo === 'carregando'));
}

function itemLeitura(rotulo, valor, explicacao, tom) {
  const item = document.createElement('div');
  item.className = 'item';
  const chamada = tag('h3', valor);
  if (tom) chamada.dataset.tom = tom;
  item.append(tag('span', rotulo, 'rotulo'), chamada, tag('p', explicacao));
  return item;
}

// A tela inteira consome uma única fotografia do par e do período. textContent
// também mantém os valores retornados pela API como texto no documento.
export function renderizar(par, periodo, registro, avisoVazio = 'Carregando candles…') {
  const base = par.slice(0, -4);
  porId('volume-unidade').textContent = '24 h · ' + base;
  porId('grafico-par').textContent = base + '/USDT · ' + ROTULOS[periodo];
  if (!registro) {
    for (const id of ['preco', 'variacao', 'volume', 'giro', 'suporte', 'resistencia']) porId(id).textContent = '—';
    delete porId('variacao').dataset.tom;
    porId('leitura').replaceChildren(tag('p', 'A leitura depende de um histórico válido para este período.', 'aguardo'));
    const linha = document.createElement('div');
    linha.append(tag('dt', 'Histórico'), tag('dd', '—'));
    porId('indicadores').replaceChildren(linha);
    porId('tempos').textContent = 'Os horários da cotação e do fechamento são exibidos em UTC.';
    grafico.atualizar(null, null, avisoVazio);
    return;
  }
  const { dados, ind, leitura } = registro;
  porId('preco').textContent = numeroBR(dados.preco);
  porId('variacao').textContent = (dados.variacao > 0 ? '+' : '') + numeroBR(dados.variacao) + '%';
  porId('variacao').dataset.tom = dados.variacao > 0 ? 'alta' : dados.variacao < 0 ? 'baixa' : 'neutro';
  porId('volume').textContent = numeroBR(dados.volume24h);
  porId('giro').textContent = numeroBR(dados.giro24h);
  porId('leitura').replaceChildren(
    itemLeitura('Tendência', leitura.tendencia, leitura.tendenciaTexto, leitura.tom),
    itemLeitura('Momento', leitura.momento, leitura.rsiTexto),
    itemLeitura('Volatilidade', leitura.volatilidade, leitura.volTexto),
  );
  porId('suporte').textContent = numeroBR(leitura.suporte);
  porId('resistencia').textContent = numeroBR(leitura.resistencia);
  const i = dados.candles.length - 1, bb = ind.bandas[i];
  const linhas = [
    ['EMA 20', numeroBR(ind.ema20[i])], ['EMA 50', numeroBR(ind.ema50[i])],
    ['RSI 14 (0–100)', numeroBR(ind.rsi[i])], ['ATR 14', numeroBR(ind.atr[i]) + ' USDT'],
    ['MACD (12, 26)', numeroBR(ind.macd.linha[i], 4)], ['Sinal (9)', numeroBR(ind.macd.sinal[i], 4)],
    ['Histograma MACD', numeroBR(ind.macd.histograma[i], 4)], ['Bollinger inferior', numeroBR(bb.inferior)],
    ['Bollinger central', numeroBR(bb.meio)], ['Bollinger superior', numeroBR(bb.superior)],
    ['Volume do candle', numeroBR(dados.candles[i].volume) + ' ' + base],
    ['Volume médio (20)', numeroBR(ind.volume[i]) + ' ' + base],
  ];
  porId('indicadores').replaceChildren(...linhas.map(([rotulo, valor]) => {
    const linha = document.createElement('div');
    linha.append(tag('dt', rotulo), tag('dd', valor));
    return linha;
  }));
  grafico.atualizar(dados, ind);
  const fim = dados.candles[i].t + PERIODOS[periodo] * 60_000;
  porId('tempos').textContent = 'Ticker Bybit: ' + horarioUTC(dados.horaTicker) +
    ' · Fechamento usado na análise: ' + horarioUTC(fim) + '.';
}
