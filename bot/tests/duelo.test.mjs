import test from 'node:test';
import assert from 'node:assert/strict';
import { configuracao } from '../lib/arquivos.mjs';
import { backtest, estrategia, executar, serieDeAlvos, simular } from '../lib/motor.mjs';
import { atualizarPaper } from '../lib/paper.mjs';
import { coletor } from '../lib/mercado.mjs';

const {cfg:base,regras:padrao} = configuracao();
const cfg = {...base,pares:['XUSDT'],inicio:0,saldo_inicial_usdt:100};
const regras = {...padrao,ema_rapida:2,ema_lenta:3,rsi_periodo:2};
const vela = (c,i,o=c) => ({t:i*cfg.passo,c,o,l:Math.min(c,o),h:Math.max(c,o),v:1,fonte:'v5'});
const serie = [5,4,3,2,5,8,9,2,1,7,8,9,7,2,1,5,9,8,2,5].map((c,i) => vela(c,i));

// Mudar o futuro não pode afetar nenhum alvo, execução ou valor anterior ao corte.
test('alvo causal e fill somente na próxima abertura, inclusive após um gap',() => {
  const dados = serie.map(b => ({...b}));
  dados[5] = vela(8,5,10);
  const alvo = estrategia(regras);
  const alvos = serieDeAlvos(dados,regras);
  for (let i=0;i<dados.length;i++) assert.equal(alvo(dados.slice(0,i+1)),alvos[i]);
  assert.equal(alvos[3],0); assert.equal(alvos[4],1);
  const rodar = x => simular({XUSDT:x},cfg,regras,0,x.length);
  const antes = rodar(dados);
  const entrada = antes.trades.find(x => x.lado==='bot');
  assert.equal(entrada.t,dados[5].t);
  assert.equal(entrada.preco,10*(1+cfg.slippage_por_execucao));
  const depois = rodar(dados.map((b,i) => i<8 ? b : vela(1000+i,i)));
  assert.deepEqual(antes.curva.slice(0,9),depois.curva.slice(0,9));
  assert.deepEqual(antes.trades.filter(x=>x.t<8*cfg.passo),depois.trades.filter(x=>x.t<8*cfg.passo));
});

test('taxas e slippage são descontados dos dois lados de uma ida e volta',() => {
  const conta = {caixa:100,quantidade:0,taxas:0,operacoes:0};
  const p = {...cfg,taxa_por_execucao:0.01,slippage_por_execucao:0.02};
  const compra = executar(conta,1,10,p);
  assert.ok(Math.abs(compra.quantidade-100/1.01/10.2)<1e-12);
  assert.equal(conta.caixa,0);
  const venda = executar(conta,0,10,p);
  const bruto = compra.quantidade*9.8;
  assert.ok(Math.abs(conta.caixa-bruto*0.99)<1e-10);
  assert.ok(Math.abs(conta.taxas-(100/1.01*0.01+bruto*0.01))<1e-10);
  assert.equal(conta.taxas,compra.taxa+venda.taxa);
  assert.equal(conta.quantidade,0);
  const sim = simular({XUSDT:serie},p,regras,0,serie.length);
  assert.equal(sim.carteiras.hold.XUSDT.operacoes,1);
  assert.ok(Math.abs(sim.carteiras.hold.XUSDT.taxas-100/1.01*0.01)<1e-10);
});

test('alterar toda a amostra de teste preserva a calibração e o treino',() => {
  const a = backtest({XUSDT:serie},cfg,regras);
  const corte=Math.floor(serie.length*cfg.fracao_treino);
  const b = backtest({XUSDT:serie.map((v,i)=>i<corte?v:vela(1000+i,i))},cfg,regras);
  assert.deepEqual(a.treino,b.treino);
  assert.deepEqual(a.calibracao,b.calibracao);
  assert.deepEqual(a.estrategia,b.estrategia);
  assert.equal(a.treino.fim,a.teste.inicio);
  assert.equal(a.teste.curva[0].bot,cfg.saldo_inicial_usdt);
});

test('paper repetido é idempotente e retoma as horas perdidas sem alterar a origem',() => {
  const rodar = (e,i) => atualizarPaper(e,{XUSDT:serie.slice(0,i)},{XUSDT:serie[i]},i*cfg.passo,cfg,regras,'teste');
  const inicial = rodar(null,5);
  assert.deepEqual(rodar(inicial,5),inicial);
  assert.ok(inicial.trades.every(op => op.t === 5*cfg.passo));
  const copia = structuredClone(inicial);
  const salto = rodar(inicial,10);
  let seguido = inicial;
  for(let i=6;i<=10;i++) seguido=rodar(seguido,i);
  assert.deepEqual(salto,seguido);
  assert.deepEqual(inicial,copia);
  assert.throws(()=>atualizarPaper(inicial,{}, {},10*cfg.passo,cfg,regras,'outro'));
  assert.deepEqual(inicial,copia);
});

test('consulta paginável usa contrato v5 público spot e lê só abertura do candle corrente',async () => {
  const fake = async url => {
    assert.equal(url.pathname,'/v5/market/kline'); assert.equal(url.searchParams.get('category'),'spot');
    assert.equal(url.searchParams.get('end'),String(cfg.passo-1));
    return Response.json({retCode:0,result:{category:'spot',symbol:'XUSDT',list:[[0,10,90,1,2,3,30]]}});
  };
  assert.deepEqual(await coletor(cfg,fake).abertura('XUSDT',0),{t:0,o:10,fonte:'v5'});
});
