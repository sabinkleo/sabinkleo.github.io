import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaMovel, ema, rsi, macd, bollinger, atr, mediaVolume, calcularIndicadores } from '../radar-ia-cripto/js/indicadores.js';
import { buscarMercado, normalizarCandles, origemDaApi, PERIODOS, PARES } from '../radar-ia-cripto/js/mercado.js';
import { interpretar } from '../radar-ia-cripto/js/leitura.js';
import worker from '../infra/cripto-bybit/worker.mjs';

// Séries determinísticas tornam os resultados verificáveis sem depender de uma cotação real.
const perto = (real, esperado) => assert.ok(Math.abs(real - esperado) < 1e-7, real + ' ≠ ' + esperado);
const serie = (n, inicio = 100) => Array.from({ length: n }, (_, i) => inicio + i);
const velas = valores => valores.map((close, i) => ({ open: close, high: close + 1, low: close - 1, close, volume: i + 1 }));
function historico(par = 'BTCUSDT', periodo = '60', agora = Date.now()) {
  const passo = PERIODOS[periodo] * 60_000, inicio = Math.floor(agora / passo) * passo;
  const lista = Array.from({ length: 121 }, (_, i) => {
    const preco = 400 - i;
    return [inicio - i * passo, preco, preco + 1, preco - 1, preco, 10 + i, 5000].map(String);
  });
  return { retCode: 0, result: { symbol: par, category: 'spot', list: lista }, time: agora };
}
function cotacao(par = 'BTCUSDT', agora = Date.now()) {
  return { retCode: 0, result: { category: 'spot', list: [{ symbol: par, lastPrice: '400.5', volume24h: '50.40', turnover24h: '50000', price24hPcnt: '0.015' }] }, time: agora };
}

test('SMA, média de volume e EMA preservam o aquecimento e o alinhamento', () => {
  assert.deepEqual(mediaMovel([2, 4, 6, 8], 3), [null, null, 4, 6]);
  assert.deepEqual(ema([null, 1, 3, 5, 7], 3), [null, null, null, 3, 5]);
  perto(ema(serie(100), 20).at(-1), 189.5);
  perto(ema(serie(100), 50).at(-1), 174.5);
  perto(mediaVolume(velas(serie(100)), 20).at(-1), 90.5);
});

test('RSI de Wilder reproduz exemplo numérico e trata séries planas e unidirecionais', () => {
  const precos = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46];
  const valores = rsi(precos);
  assert.equal(valores[13], null);
  perto(valores[14], 70.464135021);
  perto(valores[15], 66.2496185536);
  assert.equal(rsi(serie(30)).at(-1), 100);
  assert.equal(rsi(serie(30).reverse()).at(-1), 0);
  assert.equal(rsi(Array(30).fill(8)).at(-1), 50);
});

test('MACD usa 26 fechamentos para a linha e mais oito para o primeiro sinal', () => {
  const m = macd(serie(90));
  assert.equal(m.linha[24], null); perto(m.linha[25], 7);
  assert.equal(m.sinal[32], null); perto(m.sinal[33], 7); perto(m.histograma[33], 0);
  const impulso = macd([...Array(50).fill(100), 112]);
  const salto = 12 * (2 / 13 - 2 / 27);
  perto(impulso.linha.at(-1), salto); perto(impulso.sinal.at(-1), .2 * salto);
  perto(impulso.histograma.at(-1), .8 * salto);
});

test('Bollinger usa a variância populacional e o ATR incorpora gaps e a suavização de Wilder', () => {
  const b = bollinger(serie(20, 1)).at(-1);
  perto(b.meio, 10.5); perto(b.inferior, 10.5 - 2 * Math.sqrt(33.25)); perto(b.superior, 10.5 + 2 * Math.sqrt(33.25));
  const amostra = velas([10, 11, 20, 21]);
  const a = atr(amostra, 3);
  assert.deepEqual(a.slice(0, 2), [null, null]);
  perto(a[2], (2 + 2 + 10) / 3); perto(a[3], ((14 / 3) * 2 + 2) / 3);
});

test('interpretação identifica alta, baixa, lateralidade, extremos e volatilidade relativa', () => {
  for (const [precos, direcao] of [[serie(120), 'Alta'], [serie(120).reverse(), 'Baixa'], [Array(120).fill(100), 'Lateral']]) {
    const candles = velas(precos), leitura = interpretar(candles, calcularIndicadores(candles));
    assert.equal(leitura.tendencia, direcao);
    assert.equal(leitura.suporte, Math.min(...precos.slice(-20)) - 1);
    assert.equal(leitura.resistencia, Math.max(...precos.slice(-20)) + 1);
  }
  const choque = velas([...Array(119).fill(100), 115]);
  const leitura = interpretar(choque, calcularIndicadores(choque));
  assert.equal(leitura.volatilidade, 'Elevada'); assert.equal(leitura.momento, 'Forte na alta');
});

test('12 seleções ordenam candles, removem duplicados e descartam o candle aberto', () => {
  for (const par of PARES) for (const periodo of Object.keys(PERIODOS)) {
    const h = historico(par, periodo);
    h.result.list.unshift([...h.result.list[0]]);
    h.result.list.push([...h.result.list[4]]);
    const candles = normalizarCandles(h, par, periodo);
    assert.equal(candles.length, 120); assert.equal(candles.at(-1).close, 399);
    assert.ok(candles.every((c, i) => i === 0 || c.t > candles[i - 1].t));
  }
});

test('na virada do período um candle que acabou de fechar já entra na série', () => {
  const h = historico(); h.time = Number(h.result.list[0][0]) + 3_600_000;
  assert.equal(normalizarCandles(h, 'BTCUSDT', '60').at(-1).close, 400);
});

test('rejeita lacunas recentes, dados antigos, OHLC inválido e campos vazios', () => {
  const comBuraco = historico(); comBuraco.result.list.splice(5, 1);
  assert.throws(() => normalizarCandles(comBuraco, 'BTCUSDT', '60'), /insuficiente/);
  const atrasado = historico(); atrasado.result.list.splice(0, 2);
  assert.throws(() => normalizarCandles(atrasado, 'BTCUSDT', '60'), /ainda não chegou/);
  for (const campo of ['', 'NaN', '-4', '9999']) {
    const h = historico(); h.result.list[1][3] = campo;
    assert.throws(() => normalizarCandles(h, 'BTCUSDT', '60'));
  }
});

test('busca somente dois GET públicos com o contrato v5 e distingue preço, volume e giro', async t => {
  const consultas = [];
  t.mock.method(globalThis, 'fetch', async (url, opcoes) => {
    consultas.push(url);
    assert.ok(!opcoes.method || opcoes.method === 'GET'); assert.equal(opcoes.credentials, 'omit');
    assert.equal(url.origin, 'https://api.bybit.com'); assert.equal(url.searchParams.get('category'), 'spot');
    assert.equal(url.searchParams.get('symbol'), 'ETHUSDT');
    if (url.pathname.endsWith('/tickers')) return Response.json(cotacao('ETHUSDT'));
    assert.equal(url.searchParams.get('interval'), '240'); assert.equal(url.searchParams.get('limit'), '300');
    return Response.json(historico('ETHUSDT', '240'));
  });
  const dados = await buscarMercado('ETHUSDT', '240');
  assert.equal(consultas.length, 2); assert.equal(dados.preco, 400.5); assert.equal(dados.variacao, 1.5);
  assert.equal(dados.volume24h, 50.4); assert.equal(dados.giro24h, 50000); assert.equal(dados.candles.at(-1).close, 399);
});

test('HTTP 403/429 e retCode 10006 impõem pausas, inclusive Retry-After', async t => {
  let resposta;
  t.mock.method(globalThis, 'fetch', async () => resposta.clone());
  for (const [r, minimo] of [[new Response('', { status: 403 }), 600000],
    [new Response('', { status: 429, headers: { 'Retry-After': '180' } }), 180000],
    [Response.json({ retCode: 10006 }), 60000]]) {
    resposta = r;
    await assert.rejects(buscarMercado('BTCUSDT', '60'), erro => erro.pausa >= minimo);
  }
});

test('respostas HTML, ticker defasado, par incorreto e falha de transporte não viram cotação', async t => {
  let simulacao = () => new Response('<html>indisponível</html>');
  t.mock.method(globalThis, 'fetch', async url => simulacao(url));
  await assert.rejects(buscarMercado('BTCUSDT', '60'), /ilegível/);
  simulacao = url => Response.json(url.pathname.endsWith('kline') ? historico() : cotacao('BTCUSDT', Date.now() - 600000));
  await assert.rejects(buscarMercado('BTCUSDT', '60'), /defasados/);
  simulacao = url => Response.json(url.pathname.endsWith('kline') ? historico() : cotacao('ETHUSDT'));
  await assert.rejects(buscarMercado('BTCUSDT', '60'), /cotação deste par/);
  simulacao = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(buscarMercado('SOLUSDT', '15'), /nesta rede/);
  await assert.rejects(buscarMercado('BTCUSDT', '7'), /indisponível/);
  assert.throws(() => origemDaApi('http://worker.example'), /HTTPS/);
  assert.equal(origemDaApi('https://worker.example/'), 'https://worker.example');
});

const urlTeste = 'https://worker.example/v5/market/tickers?category=spot&symbol=BTCUSDT';
const origem = 'https://verticelabs.me';
function cacheTeste(t) {
  const banco = new Map();
  const original = globalThis.caches;
  globalThis.caches = { default: {
    async match(req) { return banco.get(req.url)?.clone(); },
    async put(req, res) { banco.set(req.url, res); },
  } };
  t.after(() => { if (original) globalThis.caches = original; else delete globalThis.caches; });
}
test('proxy rejeita métodos, rotas, parâmetros e origens fora da lista', async () => {
  for (const [req, status] of [[new Request(urlTeste, { method: 'POST' }), 405],
    [new Request(urlTeste.replace('market/tickers', 'order/create')), 404],
    [new Request(urlTeste + '&symbol=ETHUSDT'), 400], [new Request(urlTeste + '&url=https://example.org'), 400],
    [new Request(urlTeste.replace('BTCUSDT', 'XRPUSDT')), 400],
    [new Request(urlTeste, { headers: { Origin: 'https://example.org' } }), 403]]) {
    assert.equal((await worker.fetch(req)).status, status);
  }
  const r = await worker.fetch(new Request(urlTeste, { method: 'OPTIONS', headers: { Origin: origem } }));
  assert.equal(r.status, 204); assert.equal(r.headers.get('Access-Control-Allow-Origin'), origem);
});

test('proxy compartilha consultas, aplica cache, isola CORS e não repassa credenciais', async t => {
  cacheTeste(t);
  let chamadas = 0;
  t.mock.method(globalThis, 'fetch', async (url, opcoes) => {
    chamadas++; assert.equal(url.origin, 'https://api.bybit.com');
    assert.deepEqual(opcoes.headers, { Accept: 'application/json' });
    return Response.json(cotacao());
  });
  const req = () => new Request(urlTeste, { headers: { Origin: origem, Authorization: 'teste' } });
  const respostas = await Promise.all([worker.fetch(req()), worker.fetch(req())]);
  assert.equal(chamadas, 1);
  for (const r of respostas) { assert.equal(r.status, 200); assert.equal((await r.json()).retCode, 0); }
  const cache = await worker.fetch(new Request(urlTeste, { headers: { Origin: 'http://localhost:8000' } }));
  assert.equal(cache.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8000'); assert.equal(chamadas, 1);
});

test('front-end configurado com o Worker percorre as duas rotas públicas de ponta a ponta', async t => {
  cacheTeste(t);
  let entradas = 0, saidas = 0;
  t.mock.method(globalThis, 'fetch', async (alvo, opcoes) => {
    const u = new URL(alvo);
    if (u.origin === 'https://worker.example') {
      entradas++;
      const r = await worker.fetch(new Request(u, { headers: { Origin: origem }, signal: opcoes.signal }));
      assert.equal(r.headers.get('Access-Control-Allow-Origin'), origem);
      return r;
    }
    saidas++; assert.equal(u.origin, 'https://api.bybit.com');
    return Response.json(u.pathname.endsWith('tickers') ? cotacao('SOLUSDT') : historico('SOLUSDT', 'D'));
  });
  const dados = await buscarMercado('SOLUSDT', 'D', { proxy: 'https://worker.example' });
  assert.equal(entradas, 2); assert.equal(saidas, 2); assert.equal(dados.par, 'SOLUSDT');
  assert.equal(dados.candles.length, 120);
});

test('cancelar a seleção interrompe as duas consultas anteriores', async t => {
  const sinais = [];
  t.mock.method(globalThis, 'fetch', (url, opcoes) => new Promise((resolve, reject) => {
    sinais.push(opcoes.signal);
    opcoes.signal.addEventListener('abort', () => reject(new DOMException('Cancelado', 'AbortError')), { once: true });
  }));
  const ctrl = new AbortController();
  const pedido = buscarMercado('BTCUSDT', '15', { signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(pedido, erro => erro.name === 'AbortError');
  assert.equal(sinais.length, 2); assert.ok(sinais.every(sinal => sinal.aborted));
});

test('proxy propaga o limite e pausa novas consultas nesta instância', async t => {
  cacheTeste(t);
  let chamadas = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    chamadas++; return new Response('', { status: 429, headers: { 'Retry-After': '180' } });
  });
  for (const par of PARES) {
    const r = await worker.fetch(new Request(urlTeste.replace('BTCUSDT', par)));
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('Retry-After')) >= 179);
  }
  assert.equal(chamadas, 1);
});
