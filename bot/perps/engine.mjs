// Vértice Labs — simulador educacional de perpétuos USDT (NÃO conecta a corretoras).
// Usa candles SPOT como PROXY de preço de perp; funding constante HIPOTÉTICO, não histórico.
// Margem isolada simplificada, sem mark/index real, tiers, ADL, fila de ordens ou slippage de gap real.
export const HOUR = 3600000;
export const DAY = HOUR * 24;

export function parseCsv(text) {
  const lines=text.trim().split(/\r?\n/);
  if(lines.shift()!=='t,o,h,l,c,v,fonte') throw Error('Formato CSV inesperado');
  let last=null;
  return lines.map((line,index)=>{
    const cells=line.split(',');
    if(cells.length!==7) throw Error('Colunas incorretas na linha '+(index+2));
    const [t,o,h,l,c,v]=cells.slice(0,6).map(Number);
    if(![t,o,h,l,c,v].every(Number.isFinite)||t%HOUR!==0||
       o<=0||c<=0||l<=0||h<Math.max(o,c)||l>Math.min(o,c)||v<0||
       (last!==null&&t-last!==HOUR)) throw Error('Candle inválido ou lacuna em '+(index+2));
    last=t;
    return {t,o,h,l,c,v};
  });
}
const ema=(prices,period)=>{
  let v=0;
  return prices.map((x,i)=>{
    if(i<period){v+=x;return i===period-1?(v/=period):null;}
    v+=(x-v)*2/(period+1);return v;
  });
};
export function signalSeries(bars,strategy='donchian') {
  const signals=Array(bars.length).fill(0);
  if(strategy==='ema') {
    const close=bars.map(b=>b.c),fast=ema(close,20),slow=ema(close,50);
    for(let i=50;i<bars.length;i++)
      signals[i]=fast[i-1]>slow[i-1]?1:fast[i-1]<slow[i-1]?-1:0;
  } else if(strategy==='donchian') {
    if(bars[0]?.t % DAY!==0)throw Error('Donchian exige início à meia-noite UTC');
    const daily=[];
    for(let d=0;d*24+23<bars.length;d++)daily.push(bars[d*24+23].c);
    let state=0;
    for(let d=61;d*24<bars.length;d++) {
      const previous=d-1;
      const history=daily.slice(previous-60,previous);
      const close=daily[previous];
      if(close>Math.max(...history))state=1;
      else if(close<Math.min(...history))state=-1;
      const start=d*24,end=Math.min(start+24,bars.length);
      signals.fill(state,start,end);
    }
  } else throw Error('Estratégia desconhecida');
  return signals;
}
export const defaults=Object.freeze({
  strategy:'donchian',direction:'both',periodDays:365,leverage:2,
  stopPct:3,takePct:6,riskPct:1,marginPct:30,feePct:0.10,
  slippagePct:0.05,fundingPct:0.01,maintenancePct:0.5,
  trailingPct:2,addPct:1,scaleIn:true,cooldownHours:12,capital:1000
});
export function simulate(bars, options={}) {
  const p={...defaults,...options};
  if(!Array.isArray(bars)||bars.length<100||
    !['ema','donchian'].includes(p.strategy)||
    !['both','long','short'].includes(p.direction))throw Error('Dados ou estratégia inválidos');
  for(const k of ['periodDays','leverage','stopPct','takePct','riskPct','marginPct','feePct','slippagePct','fundingPct','maintenancePct','trailingPct','addPct','cooldownHours','capital'])
    if(!Number.isFinite(p[k]))throw Error('Parâmetro inválido: '+k);
  if(p.capital<=0||p.leverage<1||p.leverage>10||p.periodDays<7||
    p.stopPct<=0||p.takePct<=0||p.riskPct<=0||p.riskPct>5||
    p.marginPct<=0||p.marginPct>95||p.feePct<0||p.feePct>1||
    p.slippagePct<0||p.slippagePct>1||Math.abs(p.fundingPct)>1||
    p.maintenancePct<0||p.maintenancePct>=5||
    p.trailingPct<=0||p.addPct<0||p.cooldownHours<0)
    throw Error('Limites de parâmetros excedidos');
  const signal=signalSeries(bars,p.strategy);
  const warm=p.strategy==='donchian'?61*24:50;
  const start=Math.max(warm,bars.length-Math.round(p.periodDays*24));
  if(start>=bars.length-2)throw Error('Histórico insuficiente para aquecimento');
  const fee=p.feePct/100,slip=p.slippagePct/100,mmr=p.maintenancePct/100,rate=p.fundingPct/100;
  let cash=p.capital,pos=null,lastOpened=0,cooldownUntil=-1;
  let fees=0,funding=0,executions=0,closed=0,wins=0,losses=0,liquidations=0,stops=0,partialCount=0;
  let peak=p.capital,maxDD=0,exposureSum=0;
  const events=[],curve=[];
  const log=(t,kind,price,qty,details='')=>{
    if(events.length>250)events.shift();
    events.push({t,kind,price,qty,details});
  };
  const equity=price=>{
    if(!pos)return cash;
    return cash+pos.margin+pos.side*pos.qty*(price-pos.entry);
  };
  function close(q,price,t,reason,forced=false) {
    if(!pos||!(q>0))return;
    const qty=Math.min(q,pos.qty),exec=price*(1-pos.side*slip);
    const portion=qty/pos.qty,release=pos.margin*portion;
    const pnl=pos.side*qty*(exec-pos.entry);
    const charge=qty*exec*fee;
    // Em liquidação o residual da margem isolada não pode virar empréstimo da carteira.
    cash+=forced?Math.max(0,release+pnl-charge):release+pnl-charge;
    fees+=charge;executions++;
    log(t,reason,exec,qty,'PnL realizado '+pnl.toFixed(2)+' USDT');
    pos.qty-=qty;pos.margin-=release;
    if(pos.qty<=1e-10){
      if(pnl>0)wins++;else losses++;
      closed++;pos=null;
      if(forced)liquidations++;
      if(reason==='stop')stops++;
      cooldownUntil=t+p.cooldownHours*HOUR;
    } else if(reason==='parcial')partialCount++;
  }
  function open(side,price,t,scale=false) {
    const nowEquity=Math.max(0,equity(price));
    const stopFraction=p.stopPct/100;
    let budget=Math.min(nowEquity*p.riskPct/100/(stopFraction+2*(fee+slip)),
      Math.max(0,cash)*p.marginPct/100*p.leverage);
    if(scale&&pos)budget=Math.min(budget,pos.planned/2);
    const amount=scale?budget:(p.scaleIn?budget/2:budget);
    if(amount<1)return;
    const fill=price*(1+side*slip);
    const qty=Math.min(amount/fill,Math.max(0,cash)/(fill/p.leverage+fill*fee));
    if(qty<=0)return;
    const margin=qty*fill/p.leverage,charge=qty*fill*fee;
    cash-=margin+charge;fees+=charge;executions++;
    if(!pos){
      pos={side,entry:fill,qty,margin,stop:fill*(1-side*stopFraction),
        take:fill*(1+side*p.takePct/100),planned:budget,added:false,partial:false,t};
    }else{
      const total=pos.qty+qty;
      pos.entry=(pos.entry*pos.qty+fill*qty)/total;
      pos.qty=total;pos.margin+=margin;pos.added=true;
    }
    log(t,scale?'adicional':side===1?'long':'short',fill,qty,'Margem '+margin.toFixed(2)+' USDT');
    lastOpened=side;
  }
  function liquidationPrice(position) {
    const entry=position.entry,marginUnit=position.margin/position.qty;
    return position.side===1?
      Math.max(0,(entry-marginUnit)/(1-mmr)):
      (entry+marginUnit)/(1+mmr);
  }
  // Benchmark spot idêntico no intervalo efetivo e com os mesmos custos de entrada.
  const spotOpen=bars[start].o;
  const holdQty=p.capital/(spotOpen*(1+fee)*(1+slip));
  const spotAt=price=>holdQty*price;
  const initialT=bars[start].t;
  curve.push({t:initialT,perp:p.capital,hold:p.capital});
  for(let i=start;i<bars.length;i++){
    const b=bars[i],desired=signal[i],t=b.t;
    // Primeiro liquidar posições antigas no horário de funding; sinal novo ainda não executou.
    if(pos&&t%(8*HOUR)===0){
      const payment=pos.side*pos.qty*b.o*rate;
      cash-=payment;funding+=payment;
    }
    if(pos){
      const changed=desired!==pos.side && desired!==0;
      if(changed)close(pos.qty,b.o,t,'reversão');
    }
    const allowed=desired!==0&&(p.direction==='both'||
      (p.direction==='long'&&desired===1)||(p.direction==='short'&&desired===-1));
    if(!pos&&allowed&&t>=cooldownUntil&&desired!==lastOpened)open(desired,b.o,t);
    if(pos&&p.scaleIn&&!pos.added&&t>pos.t&&
      pos.side*(b.o-pos.entry)/pos.entry>=p.addPct/100)open(pos.side,b.o,t,true);
    if(pos){
      const liq=liquidationPrice(pos);
      const gap=pos.side===1?b.o<=liq:b.o>=liq;
      const hit=pos.side===1?b.l<=liq:b.h>=liq;
      if(gap||hit){
        // Modelo pessimista intrabar: marcação do contrato real é desconhecida.
        close(pos.qty,gap?b.o:liq,t,'liquidação',true);
      }else{
        const stopHit=pos.side===1?b.l<=pos.stop:b.h>=pos.stop;
        const takeHit=pos.side===1?b.h>=pos.take:b.l<=pos.take;
        if(stopHit){
          const openBeyond=pos.side===1?b.o<pos.stop:b.o>pos.stop;
          close(pos.qty,openBeyond?b.o:pos.stop,t,'stop');
        }else if(takeHit&&!pos.partial){
          close(pos.qty/2,pos.take,t,'parcial');
          if(pos)pos.partial=true;
        }
        if(pos){
          // Trailing atualizado APÓS o fechamento, nunca usado no candle em formação.
          const newStop=b.c*(1-pos.side*p.trailingPct/100);
          pos.stop=pos.side===1?Math.max(pos.stop,newStop):Math.min(pos.stop,newStop);
        }
      }
    }
    const value=equity(b.c);
    if(!Number.isFinite(value)||value< -1)throw Error('Patrimônio inválido');
    const settled=Math.max(0,value);
    peak=Math.max(peak,settled);maxDD=Math.max(maxDD,1-settled/peak);
    exposureSum+=pos?Math.abs(pos.qty*b.c)*100/Math.max(settled,1):0;
    if((i-start)%24===23||i===bars.length-1)
      curve.push({t:b.t+HOUR,perp:settled,hold:spotAt(b.c)});
  }
  return {
    summary:{
      patrimonio:+equity(bars.at(-1).c).toFixed(2),
      retornoPct:+((equity(bars.at(-1).c)/p.capital-1)*100).toFixed(2),
      holdPct:+((spotAt(bars.at(-1).c)/p.capital-1)*100).toFixed(2),
      drawdownPct:+(maxDD*100).toFixed(2),taxas:+fees.toFixed(2),
      funding:+funding.toFixed(2),executions,closed,wins,losses,liquidations,
      stops,partialCount,exposurePct:+(exposureSum/(bars.length-start)).toFixed(2),
      start:initialT,end:bars.at(-1).t+HOUR,hours:bars.length-start,
      openPosition:pos?{side:pos.side,qty:pos.qty,entry:pos.entry,liq:liquidationPrice(pos)}:null
    },curve,events
  };
}
