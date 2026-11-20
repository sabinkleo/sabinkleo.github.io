import test from 'node:test';
import assert from 'node:assert/strict';
import { atrSerie, simularComRisco } from '../lab/risk-lab.mjs';
import { readFileSync } from 'node:fs';

const params=JSON.parse(readFileSync(new URL('../lab/params.json',import.meta.url)));
const cfg={capital:1000,taxa:0.001,slippage:0.0005};
const candle=(t,o,h,l,c)=>({t:t*3600000,o,h,l,c,v:1});
const baseline=Array.from({length:40},(_,i)=>candle(i,100+i*0.2,102+i*0.2,98+i*0.2,100+i*0.2));
const sinais=Array(40).fill(1);sinais[0]=0;
const sim=(b,ss=sinais,ini=15,fim=b.length)=>simularComRisco(
  {XUSDT:b},cfg,{},params,ini,fim,{XUSDT:ss});

test('ATR inclui gaps sem antecipar o futuro',()=>{
  const a=atrSerie(baseline,4);
  const b=atrSerie(baseline.map((v,i)=>i===20?{...v,h:v.h+100}:v),4);
  assert.equal(a[3],4);
  assert.equal(a[19],b[19]);
  assert.notEqual(a[20],b[20]);
});
test('sem sinal, nao inventa operacoes nem custos',()=>{
  const r=sim(baseline,Array(40).fill(0));
  assert.equal(r.operacoes.length,0);
  assert.equal(r.resultados.patrimonio,1000);
});
test('taxas, slippage e stop entram na contabilizacao',()=>{
  const b=baseline.map(x=>({...x}));
  b[16]={...b[16],o:101,h:108,l:101,c:107};
  b[17]={...b[17],o:108,h:110,l:100,c:102};
  b[18]={...b[18],o:70,h:75,l:60,c:65};
  const r=sim(b);
  for(const o of r.operacoes){assert.ok(o.quantidade>0);assert.ok(o.taxa>0);}
  assert.ok(r.operacoes.some(o=>o.motivo==='entrada-1'));
  assert.ok(r.operacoes.some(o=>o.motivo==='stop'));
  assert.ok(r.resultados.patrimonio<cfg.capital);
});
test('se stop e alvo sao tocados no mesmo candle, prevalece stop',()=>{
  const b=baseline.map(x=>({...x}));
  b[16]={...b[16],o:102,h:150,l:50,c:120};
  const r=sim(b,Array(40).fill(1),16,18);
  assert.ok(r.operacoes.some(o=>o.motivo==='stop'));
  assert.equal(r.operacoes.filter(o=>o.motivo==='parcial').length,0);
});
test('alterar candles futuros nao altera operacoes passadas',()=>{
  const a=sim(baseline);
  const b=sim(baseline.map((x,i)=>i<25?x:{...x,o:500,h:600,l:450,c:550}));
  assert.deepEqual(a.operacoes.filter(o=>o.t<25*3600000),
    b.operacoes.filter(o=>o.t<25*3600000));
});
test('bloqueia parametros acima do risco maximo',()=>{
  assert.throws(()=>simularComRisco({XUSDT:baseline},cfg,{},
    {...params,risco_por_trade:1},15,40,{XUSDT:sinais}),/Limites de risco/);
});


test('dados vazios sao recusados com erro claro',()=>{
  assert.throws(()=>simularComRisco({},cfg,{},params,0,1),/Sem pares/);
  assert.throws(()=>simularComRisco(null,cfg,{},params,0,1),/Sem pares/);
});

test('treino inicia no mesmo primeiro candle da carteira de referencia',()=>{
  const semEntradas=Array(40).fill(0);
  const resultado=sim(baseline,semEntradas,0,40);
  assert.equal(resultado.curva.length,41);
  assert.equal(resultado.curva[0].t,baseline[0].t);
  assert.equal(resultado.resultados.patrimonio,cfg.capital);
});
