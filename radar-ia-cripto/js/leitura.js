// A mesma precisão e o mesmo fuso no gráfico e no texto facilitam conferir os valores.
const formatadores = new Map();
export function numeroBR(valor, casas = 2) {
  if (!formatadores.has(casas)) {
    formatadores.set(casas, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  }
  return formatadores.get(casas).format(valor);
}
export const ROTULOS = { '15': '15 min', '60': '1 h', '240': '4 h', D: '1 dia' };
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export const horarioUTC = ms => dataHora.format(ms) + ' UTC';

function mediana(valores) {
  const lista = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(lista.length / 2);
  return lista.length % 2 ? lista[meio] : (lista[meio - 1] + lista[meio]) / 2;
}

// As regras descrevem relações observáveis. Os limiares são heurísticas da ferramenta.
export function interpretar(candles, ind) {
  const fim = candles.length - 1, ultimo = candles[fim];
  const e20 = ind.ema20[fim], e50 = ind.ema50[fim];
  let tendencia = 'Lateral', tom = 'neutro', ordem = 'O fechamento e as EMAs 20 e 50 estão sem alinhamento de alta ou baixa.';
  if (ultimo.close > e20 && e20 > e50) {
    tendencia = 'Alta'; tom = 'alta'; ordem = 'O fechamento ficou acima da EMA 20, que ficou acima da EMA 50.';
  } else if (ultimo.close < e20 && e20 < e50) {
    tendencia = 'Baixa'; tom = 'baixa'; ordem = 'O fechamento ficou abaixo da EMA 20, que ficou abaixo da EMA 50.';
  }
  const rsi = ind.rsi[fim], bruto = ind.macd.histograma[fim];
  const hist = Math.abs(bruto) < ultimo.close * 1e-12 ? 0 : bruto;
  let momento = 'Sem confirmação conjunta';
  if (rsi > 50 && hist > 0) momento = rsi >= 60 ? 'Forte na alta' : 'Moderado na alta';
  if (rsi < 50 && hist < 0) momento = rsi <= 40 ? 'Forte na baixa' : 'Moderado na baixa';
  const relacao = hist > 0 ? 'acima' : hist < 0 ? 'abaixo' : 'no mesmo nível';
  const rsiTexto = 'RSI 14 em ' + numeroBR(rsi, 1) + '. A linha MACD está ' + relacao +
    ' da linha de sinal (histograma ' + numeroBR(hist, 4) + ').';

  // Normalizar pelo fechamento permite comparar a faixa atual com o histórico do próprio par.
  const atrPct = 100 * ind.atr[fim] / ultimo.close;
  const ultimos50 = ind.atr.slice(fim - 50, fim).map((v, i) => 100 * v / candles[fim - 50 + i].close);
  const habitual = mediana(ultimos50);
  let volatilidade = 'Habitual';
  if (atrPct > 1.25 * habitual) volatilidade = 'Elevada';
  if (atrPct < 0.75 * habitual) volatilidade = 'Baixa';
  const bb = ind.bandas[fim], larguraPct = 100 * (bb.superior - bb.inferior) / bb.meio;
  const volTexto = 'ATR 14 de ' + numeroBR(atrPct) + '% do fechamento. A mediana nos 50 candles anteriores foi ' +
    numeroBR(habitual) + '%. A largura das bandas de Bollinger é ' + numeroBR(larguraPct) + '% da média central.';

  // Extremos da janela são reproduzíveis e não pressupõem reversão futura.
  const janela = candles.slice(-20);
  return {
    tendencia, tom, tendenciaTexto: ordem + ' Fechamento de ' + numeroBR(ultimo.close) + ' USDT.',
    momento, rsiTexto, volatilidade, volTexto, atrPct,
    suporte: Math.min(...janela.map(c => c.low)), resistencia: Math.max(...janela.map(c => c.high)),
  };
}
