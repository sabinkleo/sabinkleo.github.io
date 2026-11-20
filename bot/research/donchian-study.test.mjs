import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateHourly,donchianSignals,annualVol,targets,simulate} from './donchian-study.mjs';
const D=86400000,H=3600000;
const flat=Array.from({length:145},(_,i)=>({t:i*D,o:100,h:102,l:98,c:100}));
const up=Array.from({length:145},(_,i)=>({t:i*D,o:100+i*.3,h:102+i*.3,l:98+i*.3,c:100+i*.3}));
const series={BTCUSDT:up,ETHUSDT:up,SOLUSDT:up};

test('dados horarios so geram dias completos com OHLC coerentes',()=>{
  const lines=['t,o,h,l,c,v,fonte'];
  for(let i=0;i<50;i++) lines.push([i*H,100,101,99,100,1,'v5'].join(','));
  const out=aggregateHourly(lines.join('\n'));
  assert.equal(out.length,2);
  assert.equal(out[0].t,0);
  assert.equal(out[1].t,D);
  assert.throws(()=>aggregateHourly(lines.join('\n').replace('3600000,','3600001,')),/invalido/i);
});
test('mercado plano nao e rompimento; estado nao antecipa o futuro',()=>{
  const input=flat.map(v=>({...v}));
  const s=donchianSignals(input,20);
  assert.equal(s.reduce((a,b)=>a+b,0),0);
  input[90]={...input[90],c:110,h:111};
  const later=donchianSignals(input,20);
  assert.deepEqual(later.slice(0,90),s.slice(0,90));
  assert.equal(later[89],0);
  assert.equal(later[90],1);
});
test('volatilidade usa somente dias anteriores e e nao-negativa',()=>{
  assert.equal(annualVol(up,20),null);
  assert.ok(annualVol(up,60)>=0);
  const changed=up.map((x,i)=>i>=60?{...x,c:x.c+500}:x);
  assert.equal(annualVol(up,60),annualVol(changed,60));
});
test('cash nao opera e mantem capital',()=>{
  const r=simulate(series,'cash',60,140,.001,.0005);
  assert.equal(r.fills,0);
  assert.equal(r.taxas_usdt,0);
  assert.equal(r.patrimonio,1000);
});
test('hold e hold50 compram apenas uma vez por par',()=>{
  const full=simulate(series,'hold',60,140,.001,.0005);
  const half=simulate(series,'hold50',60,140,.001,.0005);
  assert.equal(full.fills,3);
  assert.equal(half.fills,3);
  assert.ok(half.taxas_usdt<full.taxas_usdt);
  assert.ok(half.exposicao_media_pct<full.exposicao_media_pct);
});
test('custos em dobro pioram desempenho mantendo o mesmo sinal',()=>{
  for(const kind of ['hold','donchian20','donchian60','ensemble']){
    const normal=simulate(series,kind,60,140,.001,.0005);
    const double=simulate(series,kind,60,140,.002,.001);
    assert.ok(normal.patrimonio>=double.patrimonio-1e-8,kind);
  }
});
test('alteracoes no futuro nao mudam patrimonio ou sinais passados',()=>{
  const old=simulate(series,'ensemble',60,100,.001,.0005);
  const change=Object.fromEntries(Object.entries(series).map(([p,days])=>
    [p,days.map((d,i)=>i>=100?{...d,c:d.c*10,h:d.h*10,o:d.o*10,l:d.l*10}:d)]));
  const altered=simulate(change,'ensemble',60,100,.001,.0005);
  assert.deepEqual(old.curva,altered.curva);
});
test('sinal do fechamento so executa na abertura seguinte',()=>{
  const arr=flat.map(v=>({...v}));
  arr[60]={...arr[60],c:110,h:111};
  const r=simulate({BTCUSDT:arr},'donchian20',60,65,.001,.0005);
  assert.equal(r.curva[1].capital,1000);
  assert.ok(r.fills>=1);
  assert.equal(r.curva[2].capital<1000,true);
});
test('nao aceita calendarios desalinhados ou janelas invalidas',()=>{
  assert.throws(()=>simulate({A:up,B:up.map((x,i)=>i===70?{...x,t:x.t+1}:x)},'hold',60,100,.001,.0005),/Calendario/);
  assert.throws(()=>simulate(series,'hold',10,100,.001,.0005),/Janela/);
});
