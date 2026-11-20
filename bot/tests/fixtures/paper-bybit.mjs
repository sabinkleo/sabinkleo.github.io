const passo = 3600000;
Date.now = () => Number(process.env.PAPER_TEST_NOW);
globalThis.fetch = async url => {
  const par = url.searchParams.get('symbol');
  if (process.env.PAPER_TEST_OUTAGE && par !== 'BTCUSDT') return new Response(null,{status:403});
  const inicio = Number(url.searchParams.get('start'));
  const limite = Number(url.searchParams.get('limit'));
  if (url.pathname !== '/v5/market/kline' || !par || !limite) throw Error('Requisição inesperada no teste');
  return Response.json({retCode:0,result:{category:'spot',symbol:par,
    list:Array.from({length:limite},(_,i) => [inicio+i*passo,100,101,99,100,123])}});
};
