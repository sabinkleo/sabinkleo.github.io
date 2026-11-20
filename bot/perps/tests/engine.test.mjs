// Todos os testes usam candles sintéticos; nenhuma API e nenhuma ordem real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,signalSeries,simulate,HOUR,DAY} from '../engine.mjs';

const make=(count=2000,fn=i=>100+i*.05)=>Array.from({length:count},(_,i)=>{
  const o=fn(i),c=fn(i+1);
  return {t:i*HOUR,o,c,h:Math.max(o,c)*1.001,l:Math.min(o,c)*.999,v:100};
});
const cfg={strategy:'ema',periodDays:30,leverage:2,capital:1000,scaleIn:true};

test('CSV rejeita lacunas, formatacao e candles sem coerencia',()=>{
  const a='t,o,h,l,c,v,fonte\n0,100,101,99,100,5,grafico_spot\n3600000,100,102,98,101,3,grafico_spot';
  assert.equal(parseCsv(a).length,2);
  assert.throws(()=>parseCsv(a.replace('3600000,','7200000,')),/lacuna/);
  assert.throws(()=>parseCsv(a.replace('100,102,98,101','100,100,102,101')), /inválido/);
});
test('alteracao futura nao muda sinais de periodos passados',()=>{
  const bars=make();
  const a=signalSeries(bars,'ema');
  const b=signalSeries(bars.map((v,i)=>i<900?v:{...v,c:v.c+1000}),'ema');
  assert.deepEqual(a.slice(0,900),b.slice(0,900));
});
test('spot hold sem estrategia entrega retorno e nunca gera funding',()=>{
  const bars=make();
  const out=simulate(bars,{...cfg,direction:'short'});
  assert.ok(Number.isFinite(out.summary.holdPct));
  assert.equal(out.summary.capital,undefined);
  assert.ok(Number.isFinite(out.summary.patrimonio));
  assert.ok(out.curve.length>2);
});
test('long em tendencia ascendente e short em descendente',()=>{
  const longs=simulate(make(),{...cfg,direction:'long',stopPct:5,takePct:10});
  const shorts=simulate(make(2000,i=>300-i*.06),{...cfg,direction:'short',stopPct:5,takePct:10});
  assert.ok(longs.events.some(x=>x.kind==='long'));
  assert.ok(shorts.events.some(x=>x.kind==='short'));
  assert.ok(longs.events.every(x=>x.qty>=0));
});
test('funding positivo e debitado do long e creditado do short',()=>{
  const longBars=make(2000,i=>100+i*.002);
  const a=simulate(longBars,{...cfg,direction:'long',fundingPct:0.01,stopPct:20,takePct:80});
  const b=simulate(longBars,{...cfg,direction:'long',fundingPct:0,stopPct:20,takePct:80});
  assert.ok(a.summary.funding>=0);
  assert.ok(a.summary.patrimonio<=b.summary.patrimonio+0.001);
  const shortBars=make(2000,i=>300-i*.004);
  const s=simulate(shortBars,{...cfg,direction:'short',fundingPct:0.01,stopPct:20,takePct:80});
  assert.ok(s.summary.funding<=0);
});
test('alavancagem, capital e taxa fora dos limites abortam',()=>{
  const b=make();
  assert.throws(()=>simulate(b,{...cfg,leverage:25}),/Limites/);
  assert.throws(()=>simulate(b,{...cfg,capital:-1}),/Limites/);
  assert.throws(()=>simulate(b,{...cfg,feePct:2}),/Limites/);
});
test('stop, tomada parcial e liquidacao ficam registraveis',()=>{
  const b=make(1700,i=>i<1580?100+i*.04:163.2-(i-1580)*.45);
  const out=simulate(b,{...cfg,direction:'both',leverage:5,
    stopPct:2,takePct:2.5,scaleIn:true});
  assert.ok(out.events.length>0);
  assert.ok(Number.isFinite(out.summary.stops));
  assert.ok(Number.isFinite(out.summary.partialCount));
  assert.ok(Number.isFinite(out.summary.liquidations));
  assert.ok(out.summary.drawdownPct<=100);
});
test('sem lookahead em simulacoes com mesmo passado',()=>{
  const original=make(2200,i=>100+Math.sin(i/10)*5+i*.01);
  const altered=original.map((x,i)=>i<1900?x:{...x,o:x.o*1.05,c:x.c*1.05,h:x.h*1.06,l:x.l*1.04});
  const a=simulate(original,{...cfg,periodDays:20}),b=simulate(altered,{...cfg,periodDays:20});
  // A janela efetiva muda com o tamanho de entrada, portanto compare mesmo total.
  const cutoff=1900*HOUR;
  assert.deepEqual(a.events.filter(x=>x.t<cutoff),
    b.events.filter(x=>x.t<cutoff));
});
test('Donchian 60 dias usa so 60 dias concluidos para abrir a primeira posicao',()=>{
  const b=make(2200,i=>100+i*.1);
  const signals=signalSeries(b,'donchian');
  assert.ok(signals.slice(0,61*24).every(x=>x===0));
  assert.ok(signals.slice(61*24).some(x=>x===1));
});

test('stop e executado antes de liquidacao se for a primeira barreira tocada',()=>{
  const b=make(1900,i=>100+i*.01).map(x=>({...x}));
  const index=1900-30*24+2;
  b[index]={...b[index],o:b[index].o,h:b[index].o*1.01,
    l:b[index].o*.80,c:b[index].o*.97};
  const x=simulate(b,{...cfg,periodDays:30,direction:'long',leverage:10,
    scaleIn:false,stopPct:3,takePct:60,trailingPct:3});
  assert.ok(x.events.some(e=>e.kind==='stop'));
  // Entrada na abertura. Wick de -20% cruzaria o nivel de liquidacao,
  // mas o stop de 3% deveria ser atingido primeiro.
  assert.ok(x.events.filter(e=>e.t===b[index].t).some(e=>e.kind==='stop'));
});
test('gap que ultrapassa margem liquidavel registra liquidacao',()=>{
  const b=make(1900,i=>100+i*.01).map(x=>({...x}));
  const index=1900-30*24+2;
  b[index]={...b[index],o:b[index].o*.50,
    h:b[index].o*.52,l:b[index].o*.49,c:b[index].o*.50};
  const x=simulate(b,{...cfg,periodDays:30,direction:'long',leverage:10,
    scaleIn:false,stopPct:20,takePct:60,trailingPct:20});
  assert.ok(x.events.some(e=>e.kind==='liquidação'));
  assert.ok(x.summary.liquidations>=1);
});
