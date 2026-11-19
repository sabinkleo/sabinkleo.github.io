// O Worker só consulta duas rotas públicas. O cliente não escolhe o host de destino.
const ORIGENS = new Set(['https://verticelabs.me', 'https://www.verticelabs.me',
  'http://localhost:8000', 'http://127.0.0.1:8000']);
const PARES = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
const PERIODOS = new Set(['15', '60', '240', 'D']);
const KLINE = '/v5/market/kline', TICKER = '/v5/market/tickers';
const pendentes = new Map();
let pausaAte = 0, statusPausa = 429;

function erro(status, mensagem, segundos = 0) {
  const headers = { 'Cache-Control': 'no-store' };
  if (segundos) headers['Retry-After'] = String(segundos);
  return Response.json({ erro: mensagem }, { status, headers });
}

function destino(url) {
  const q = url.searchParams, candle = url.pathname === KLINE;
  const campos = candle ? ['category', 'symbol', 'interval', 'limit'] : ['category', 'symbol'];
  if ([...q.keys()].some(chave => !campos.includes(chave) || q.getAll(chave).length !== 1)) return null;
  if (q.get('category') !== 'spot' || !PARES.has(q.get('symbol'))) return null;
  if (candle && (!PERIODOS.has(q.get('interval')) || (q.has('limit') && q.get('limit') !== '300'))) return null;
  const alvo = new URL(url.pathname, 'https://api.bybit.com');
  // A ordem canônica mantém uma única chave de cache por consulta equivalente.
  for (const campo of campos) alvo.searchParams.set(campo, campo === 'limit' ? '300' : q.get(campo));
  return alvo;
}

function pausar(status, headers) {
  const valor = headers.get('Retry-After') || '';
  const retry = /^\d+(\.\d+)?$/.test(valor) ? Number(valor) * 1000 : Date.parse(valor) - Date.now();
  const reset = Number(headers.get('X-Bapi-Limit-Reset-Timestamp')) - Date.now();
  const espera = Math.max(status === 403 ? 600_000 : 60_000, retry || 0, reset || 0);
  if (Date.now() + espera >= pausaAte) { pausaAte = Date.now() + espera; statusPausa = status; }
  return erro(statusPausa, 'A Bybit pediu uma pausa.', Math.ceil((pausaAte - Date.now()) / 1000));
}

async function consultar(alvo, chave, cache) {
  try {
    const r = await fetch(alvo, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(9000) });
    if (r.status === 403 || r.status === 429) return pausar(r.status, r.headers);
    if (!r.ok) return erro(502, 'A Bybit está indisponível.');
    const dados = await r.json();
    if (dados?.retCode === 10006 || dados?.retCode === 429) return pausar(429, r.headers);
    if (dados?.retCode === 10009) return pausar(403, r.headers);
    if (dados?.retCode !== 0 || !Array.isArray(dados.result?.list)) return erro(502, 'Resposta inválida da Bybit.');
    const resposta = Response.json(dados, { headers: { 'Cache-Control': 'public, max-age=50' } });
    // Uma falha isolada do cache não invalida dados que já chegaram da bolsa.
    try { await cache.put(chave, resposta.clone()); } catch { /* Cache opcional. */ }
    return resposta;
  } catch {
    return erro(502, 'Sem resposta válida da Bybit.');
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url), origem = request.headers.get('Origin');
    if (origem && !ORIGENS.has(origem)) return erro(403, 'Origem não permitida.');
    // Os cabeçalhos CORS são aplicados depois do cache para não misturar origens.
    function entregar(resposta) {
      const headers = new Headers(resposta.headers);
      if (origem) headers.set('Access-Control-Allow-Origin', origem);
      headers.set('Vary', 'Origin');
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Accept');
      headers.set('Access-Control-Expose-Headers', 'Retry-After');
      headers.set('Cache-Control', 'no-store');
      return new Response(resposta.body, { status: resposta.status, headers });
    }
    if (![KLINE, TICKER].includes(url.pathname)) return entregar(erro(404, 'Rota desconhecida.'));
    if (request.method === 'OPTIONS') return entregar(new Response(null, { status: 204 }));
    if (request.method !== 'GET') return entregar(erro(405, 'Use GET.'));
    const alvo = destino(url);
    if (!alvo) return entregar(erro(400, 'Par, período ou parâmetros inválidos.'));
    const chave = new Request(url.origin + alvo.pathname + alvo.search);
    const cache = caches.default;
    let salva;
    try { salva = await cache.match(chave); } catch { /* O acesso direto ainda pode responder. */ }
    if (salva) return entregar(salva);
    if (Date.now() < pausaAte) return entregar(erro(statusPausa, 'Consultas pausadas.', Math.ceil((pausaAte - Date.now()) / 1000)));
    // Requisições simultâneas compartilham texto. Cada cliente recebe seu próprio
    // corpo de resposta, pois streams de um pedido pertencem àquele pedido.
    if (!pendentes.has(chave.url)) {
      const consulta = consultar(alvo, chave, cache).then(async r => ({
        corpo: await r.text(), status: r.status, headers: [...r.headers],
      }));
      pendentes.set(chave.url, consulta.finally(() => pendentes.delete(chave.url)));
    }
    const { corpo, status, headers } = await pendentes.get(chave.url);
    return entregar(new Response(corpo, { status, headers }));
  },
};
