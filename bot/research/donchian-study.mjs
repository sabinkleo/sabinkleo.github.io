// Replica simplificada de trend following, pre-especificada a partir de pesquisa.
// Mantem os arquivos e o paper existentes intactos; nenhum endpoint de ordem real.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DAY = 86400000, HOUR = 3600000;

export function aggregateHourly(csv) {
  const [header,...rows] = csv.trim().split(/\r?\n/);
  if (header !== 't,o,h,l,c,v,fonte') throw Error('Cabecalho de candles inesperado');
  const buckets = new Map();
  let last = null;
  for (const line of rows) {
    const columns = line.split(',');
    if (columns.length!==7) throw Error('Linha incompleta');
    const [t,o,h,l,c,v] = columns.slice(0,6).map(Number);
    if (![t,o,h,l,c,v].every(Number.isFinite) || !Number.isSafeInteger(t) ||
        t % HOUR !== 0 || o<=0 || c<=0 || l<=0 || h<o || h<c || l>o || l>c || v<0)
      throw Error('Candle invalido em '+t);
    if (last!==null && t!==last+HOUR) throw Error('Gap ou duplicata no historico');
    last=t;
    const d=Math.floor(t/DAY)*DAY;
    if(!buckets.has(d)) buckets.set(d,[]);
    buckets.get(d).push({t,o,h,l,c,v});
  }
  const result=[];
  for(const [t,arr] of buckets){
    // Ultimo dia incompleto nunca entra na avaliacao.
    if(arr.length!==24) continue;
    if(arr[0].t!==t || arr[23].t!==t+23*HOUR)
      throw Error('Dia desalinhado');
    result.push({t,o:arr[0].o,c:arr[23].c,
      h:Math.max(...arr.map(x=>x.h)),l:Math.min(...arr.map(x=>x.l))});
  }
  return result;
}

// Donchian por FECHAMENTOS: sinal conhecido no fechamento do dia d,
// com preenchimento apenas na abertura de d+1.
export function donchianSignals(days,window) {
  if(!Number.isInteger(window)||window<2) throw Error('Janela invalida');
  const signal=Array(days.length).fill(0);
  let state=0,trail=-Infinity;
  for(let i=window;i<days.length;i++){
    const previous=days.slice(i-window,i).map(x=>x.c);
    const recent=days.slice(i-window+1,i+1).map(x=>x.c);
    const upperPrior=Math.max(...previous);
    const middle=(Math.max(...recent)+Math.min(...recent))/2;
    const last=days[i].c;
    if(state===1 && last<=trail) {
      state=0;trail=-Infinity;
    } else if(state===0 && last>upperPrior) {
      state=1;trail=middle;
    } else if(state===1) {
      trail=Math.max(trail,middle);
    }
    signal[i]=state;
  }
  return signal;
}
export function annualVol(days,index,window=30) {
  if(index<window+1) return null;
  const r=[];
  for(let j=index-window;j<index;j++)
    r.push(Math.log(days[j].c/days[j-1].c));
  const mean=r.reduce((a,b)=>a+b,0)/r.length;
  const varSample=r.reduce((a,b)=>a+(b-mean)**2,0)/(r.length-1);
  return Math.sqrt(varSample*365);
}
export function targets(days,kind) {
  const s10=donchianSignals(days,10),s20=donchianSignals(days,20),
    s60=donchianSignals(days,60);
  return days.map((x,i)=>{
    if(kind==='hold') return 1;
    if(kind==='hold50') return .5;
    if(kind==='cash') return 0;
    if(kind==='donchian20') return s20[i];
    if(kind==='donchian60') return s60[i];
    if(kind==='ensemble') return (s10[i]+s20[i]+s60[i])/3;
    if(kind==='ensemble-vol') {
      const v=annualVol(days,i+1,30);
      return (s10[i]+s20[i]+s60[i])/3*(v&&v>0?Math.min(1,0.25/v):0);
    }
    throw Error('Politica desconhecida');
  });
}
export function simulate(series,kind,start,end,fee,slippage,capital=1000) {
  const pairs=Object.keys(series);
  if(!pairs.length||pairs.some(p=>series[p].length!==series[pairs[0]].length) ||
     !Number.isInteger(start)||!Number.isInteger(end)||start<60||end>series[pairs[0]].length||end<=start)
    throw Error('Janela ou pares invalidos');
  if(![fee,slippage].every(x=>Number.isFinite(x)&&x>=0&&x<0.1)||capital<=0)
    throw Error('Custos ou capital invalidos');
  const base=series[pairs[0]];
  for(const p of pairs) for(let i=0;i<end;i++) {
    if(series[p][i].t!==base[i].t) throw Error('Calendario diferente entre pares');
  }
  const aims=Object.fromEntries(pairs.map(p=>[p,targets(series[p],kind)]));
  const states=Object.fromEntries(pairs.map(p=>[p,{cash:capital/pairs.length,qty:0,fees:0,fills:0}]));
  const curve=[{t:base[start].t,capital}];
  let allocation=0;
  for(let i=start;i<end;i++){
    for(const p of pairs) {
      const q=series[p][i], s=states[p], o=q.o, desired=aims[p][i-1];
      const worth=s.cash+s.qty*o;
      const current=worth>0?s.qty*o/worth:0;
      const prev= i>start?aims[p][i-2]:-1;
      const signalChanged=Math.abs(desired-prev)>1e-8;
      // Manter posicoes sem rebalanceamento desnecessario; para vol-target,
      // somente modificar por sinal ou diferenca de pelo menos 20 p.p.
      const rebalance=signalChanged ||
        (kind==='ensemble-vol' && Math.abs(desired-current)>=.20);
      if(!rebalance) continue;
      // Vendas recebem slippage adverso; compras pagam fee e slippage.
      if(desired<current-1e-8) {
        const qty=desired===0?s.qty:(current-desired)*worth/o;
        const sell=Math.min(s.qty,qty);
        if(sell>1e-10){
          const gross=sell*o*(1-slippage),cost=gross*fee;
          s.cash+=gross-cost;s.qty-=sell;s.fees+=cost;s.fills++;
          if(s.qty<1e-9) s.qty=0;
        }
      } else if(desired>current+1e-8) {
        const budget=Math.min(s.cash,Math.max(0,(desired-current)*worth));
        const qty=budget/(o*(1+slippage)*(1+fee));
        if(qty>1e-10){
          const gross=qty*o*(1+slippage),cost=gross*fee;
          s.cash-=gross+cost;s.qty+=qty;s.fees+=cost;s.fills++;
        }
      }
    }
    const val=pairs.reduce((sum,p)=>sum+states[p].cash+states[p].qty*series[p][i].c,0);
    if(!Number.isFinite(val)||val<=0) throw Error('Patrimonio invalido');
    curve.push({t:base[i].t+DAY,capital:val});
    allocation+=pairs.reduce((sum,p)=>{
      const s=states[p],v=s.cash+s.qty*series[p][i].c;
      return sum+(v>0?s.qty*series[p][i].c/v:0);
    },0)/pairs.length;
  }
  let peak=capital,dd=0;
  for(const pt of curve) {
    peak=Math.max(peak,pt.capital);
    dd=Math.max(dd,1-pt.capital/peak);
  }
  return {
    inicio_utc:new Date(base[start].t).toISOString().slice(0,10),
    fim_exclusivo_utc:new Date(base[end-1].t+DAY).toISOString().slice(0,10),
    dias:end-start, patrimonio:curve.at(-1).capital,
    retorno_pct:100*(curve.at(-1).capital/capital-1),
    drawdown_pct:100*dd,
    fills:pairs.reduce((v,p)=>v+states[p].fills,0),
    taxas_usdt:pairs.reduce((v,p)=>v+states[p].fees,0),
    exposicao_media_pct:100*allocation/(end-start),
    curva:curve
  };
}
export function runDataset() {
  const pairs=['BTCUSDT','ETHUSDT','SOLUSDT'];
  const series=Object.fromEntries(pairs.map(p=>[p,
    aggregateHourly(readFileSync(join(ROOT,'..','data',p+'-60m.csv'),'utf8'))]));
  const length=series.BTCUSDT.length;
  if(length<125)throw Error('Amostra curta (< 125 dias completos)');
  for(const p of pairs) {
    if(series[p].length!==length) throw Error('Cobertura distinta');
    for(let i=0;i<length;i++) if(series[p][i].t!==series.BTCUSDT[i].t)
      throw Error('Dias desalinhados');
  }
  const start=60,cut=Math.floor(length*.60);
  if(cut<=start+15 || length-cut<20)throw Error('Treino ou teste curto');
  const variants=['cash','hold50','hold','donchian20','donchian60','ensemble','ensemble-vol'];
  const fees=[{id:'base',fee:.001,slippage:.0005},
    {id:'custos_2x',fee:.002,slippage:.001}];
  const phases=[['treino',start,cut],['teste_historico',cut,length],
    ['completo',start,length]];
  const results={premissas:{
    dados:'Candles Bybit spot cacheados, agregados em dias UTC completos',
    pares,pre_especificado:'Donchian 20/60 dias, ensemble 10/20/60 e vol-target 25% sem alavancagem',
    corretagem:'0.1% taker + 0.05% slippage por lado; cenario de custos em dobro',
    sinal:'Somente fechamento anterior; execucao na proxima abertura',
    aviso:'2026 foi visto na discussao; comparacao exploratoria, NAO validacao cega ou lucro futuro'
  },periodos:{},resultados:[]};
  for(const [phase,a,b] of phases) {
    results.periodos[phase]={inicio:series.BTCUSDT[a].t,fim:series.BTCUSDT[b-1].t+DAY,dias:b-a};
    for(const costs of fees) for(const strategy of variants){
      const r=simulate(series,strategy,a,b,costs.fee,costs.slippage);
      const {curva,...stats}=r;
      results.resultados.push({fase:phase,custos:costs.id,estrategia:strategy,...stats});
    }
  }
  return results;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  console.log(JSON.stringify(runDataset(),null,2));
}
