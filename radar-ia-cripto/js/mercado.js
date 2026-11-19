export const PARES = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
export const PERIODOS = { '15': 15, '60': 60, '240': 240, D: 1440 };
export const LIMITE = 300;
export const CICLO = 60_000;
const BYBIT = 'https://api.bybit.com';

// Uma pausa imposta pela bolsa deve valer também quando o visitante troca de par.
export class ErroMercado extends Error {
  constructor(mensagem, pausa = 0) {
    super(mensagem);
    this.pausa = pausa;
  }
}

function esperaDoServidor(headers) {
  const valor = headers.get('Retry-After');
  const segundos = valor && /^\d+(\.\d+)?$/.test(valor);
  const duracao = segundos ? Number(valor) * 1000 : Date.parse(valor || '') - Date.now();
  const reset = Number(headers.get('X-Bapi-Limit-Reset-Timestamp')) - Date.now();
  return Math.max(0, Number.isFinite(duracao) ? duracao : 0, Number.isFinite(reset) ? reset : 0);
}

function numero(valor, minimo = -Infinity) {
  if (!['string', 'number'].includes(typeof valor) || String(valor).trim() === '') throw new ErroMercado('A Bybit devolveu um campo vazio.');
  const n = Number(valor);
  if (!Number.isFinite(n) || n < minimo) throw new ErroMercado('A Bybit devolveu um número inválido.');
  return n;
}

// A origem configurada aponta para o nosso Worker. Assim, instalações que precisam
// de CORS evitam repetir uma chamada direta que já sabem que falharia.
export function origemDaApi(proxy = '') {
  if (!proxy.trim()) return BYBIT;
  let url;
  try { url = new URL(proxy); } catch { throw new ErroMercado('O endereço do proxy está inválido.'); }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:';
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ErroMercado('Configure o proxy com a origem HTTPS do Worker.');
  }
  return url.origin;
}

async function consultar(origem, recurso, parametros, signal) {
  const url = new URL('/v5/market/' + recurso, origem);
  url.search = new URLSearchParams(parametros);
  const resposta = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
  const espera = esperaDoServidor(resposta.headers);
  if (resposta.status === 403) throw new ErroMercado('A Bybit recusou o acesso a partir desta rede.', Math.max(600_000, espera));
  if (resposta.status === 429) throw new ErroMercado('A Bybit pediu uma pausa nas consultas.', Math.max(CICLO, espera));
  if (!resposta.ok) throw new ErroMercado('A consulta à Bybit falhou (HTTP ' + resposta.status + ').', espera);
  const dados = await resposta.json();
  if (dados?.retCode === 10006 || dados?.retCode === 429) throw new ErroMercado('A Bybit limitou as consultas.', Math.max(CICLO, espera));
  if (dados?.retCode === 10009) throw new ErroMercado('A Bybit bloqueou temporariamente este endereço.', Math.max(600_000, espera));
  if (dados?.retCode !== 0 || dados.result?.category !== 'spot' || !Array.isArray(dados.result.list)) {
    throw new ErroMercado('A Bybit não devolveu os dados do mercado à vista.');
  }
  return dados;
}

// Ordenar antes dos cálculos é essencial: a Bybit envia o candle mais recente primeiro.
// O relógio da própria resposta determina se o candle encerrou, inclusive no diário UTC.
export function normalizarCandles(resposta, par, periodo) {
  if (resposta.result.symbol !== par) throw new ErroMercado('A Bybit devolveu candles de outro par.');
  const agora = numero(resposta.time, 1), passo = PERIODOS[periodo] * 60_000;
  const porTempo = new Map();
  for (const linha of resposta.result.list) {
    if (!Array.isArray(linha) || linha.length < 6) throw new ErroMercado('O histórico de candles veio incompleto.');
    const t = numero(linha[0], 1);
    if (!Number.isSafeInteger(t) || t % passo !== 0) throw new ErroMercado('O horário de um candle é inválido.');
    if (t + passo > agora) continue;
    const [open, high, low, close, volume] = linha.slice(1, 6).map(x => numero(x, 0));
    if (low <= 0 || low > Math.min(open, close) || high < Math.max(open, close)) throw new ErroMercado('Um candle chegou com preços inconsistentes.');
    porTempo.set(t, { t, open, high, low, close, volume });
  }
  const ordenados = [...porTempo.values()].sort((a, b) => a.t - b.t);
  let inicio = 0;
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].t - ordenados[i - 1].t !== passo) inicio = i;
  }
  // Usar o trecho contíguo mais recente impede que uma lacuna vire um candle inventado.
  const candles = ordenados.slice(inicio);
  if (candles.length < 100) throw new ErroMercado('Histórico insuficiente para calcular os indicadores com segurança.');
  if (agora - (candles.at(-1).t + passo) >= passo) throw new ErroMercado('O último candle fechado ainda não chegou da Bybit.');
  return candles;
}

// Cada atualização reúne ticker e candles da mesma seleção antes de liberar a tela.
// O cancelamento conjunto evita que uma resposta atrasada misture dois mercados.
export async function buscarMercado(par, periodo, { signal, proxy = '' } = {}) {
  if (!PARES.includes(par) || !Object.hasOwn(PERIODOS, periodo)) throw new ErroMercado('Par ou período indisponível.');
  const origem = origemDaApi(proxy);
  const lote = new AbortController();
  const cancelar = () => lote.abort();
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  const prazo = setTimeout(cancelar, 12_000);
  const comum = { category: 'spot', symbol: par };
  try {
    const [historico, cotacao] = await Promise.all([
      consultar(origem, 'kline', { ...comum, interval: periodo, limit: String(LIMITE) }, lote.signal),
      consultar(origem, 'tickers', comum, lote.signal),
    ]);
    const ticker = cotacao.result.list.find(item => item.symbol === par);
    if (!ticker) throw new ErroMercado('A Bybit não enviou a cotação deste par.');
    const preco = numero(ticker.lastPrice, 0);
    if (preco === 0) throw new ErroMercado('A cotação recebida é inválida.');
    const horaTicker = numero(cotacao.time, 1), horaKline = numero(historico.time, 1);
    // O cache do proxy dura 50 s. Vários minutos de diferença indicam resposta
    // antiga ou relógio local incorreto; nos dois casos evitamos rotulá-la como atual.
    if (Math.abs(Date.now() - horaTicker) > 5 * CICLO || Math.abs(horaTicker - horaKline) > 2 * CICLO) {
      throw new ErroMercado('Os horários dos dados estão defasados. Confira o relógio do dispositivo.');
    }
    return {
      par, periodo, candles: normalizarCandles(historico, par, periodo),
      horaTicker, preco, variacao: numero(ticker.price24hPcnt) * 100,
      volume24h: numero(ticker.volume24h, 0), giro24h: numero(ticker.turnover24h, 0),
    };
  } catch (erro) {
    if (signal?.aborted || erro instanceof ErroMercado) throw erro;
    if (lote.signal.aborted) throw new ErroMercado('A Bybit demorou para responder.');
    if (erro instanceof SyntaxError) throw new ErroMercado('A Bybit enviou uma resposta ilegível.');
    throw new ErroMercado('Não foi possível consultar a Bybit nesta rede.');
  } finally {
    clearTimeout(prazo);
    signal?.removeEventListener('abort', cancelar);
    cancelar();
  }
}
