import {parseCsv,simulate,defaults} from '../bot/perps/engine.mjs';
const $=id=>document.getElementById(id);
const USDT=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtP=v=>(v>0?'+':'')+USDT(v)+'%';
const fmtDate=t=>new Intl.DateTimeFormat('pt-BR',{
  day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',
  timeZone:'America/Sao_Paulo'}).format(t);
const cache=new Map();
const dataFile=p=> '../bot/history/'+p+'-60m-2025-11-20_2026-11-19.csv';
const range=['leverage','riskPct','marginPct','stopPct','takePct','feePct','fundingPct'];
const fields=['pair','strategy','direction','periodDays',...range,'scaleIn'];
let current=null,loading=0,pending=0,hover=null,chartRange=null;
function inputs(){
  const p={...defaults};
  for(const key of fields){
    const input=$(key);
    p[key]=key==='scaleIn'?input.checked:(range.includes(key)||key==='periodDays'?Number(input.value):input.value);
  }
  return p;
}
function updateLabels(){
  for(const name of range)
    $(name+'-out').textContent=USDT(Number($(name).value)).replace(/,00$/,'')+
      (name==='leverage'?'×':'%');
}
async function candles(pair){
  if(cache.has(pair))return cache.get(pair);
  const promise=(async()=>{
    const response=await fetch(dataFile(pair),{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('CSV '+pair+' indisponível (HTTP '+response.status+')');
    const text=await response.text();
    const rows=parseCsv(text);
    if(rows.length!==8760)throw Error('Histórico incompleto ('+rows.length+'/8760 candles)');
    return rows;
  })();
  cache.set(pair,promise);
  try{return await promise;}catch(err){cache.delete(pair);throw err;}
}
function setSign(id,val){
  const node=$(id);node.textContent=fmtP(val);
  node.classList.remove('good','bad','neutral');
  node.classList.add(val>0?'good':val<0?'bad':'neutral');
}
async function recalc(){
  const id=++loading;
  $('error').textContent='Carregando e recalculando...';
  $('simulate').disabled=true;
  try{
    const opts=inputs(),bars=await candles($('pair').value);
    if(id!==loading)return;
    const out=simulate(bars,opts);
    if(id!==loading)return;
    current=out;hover=null;
    $('equity').textContent=USDT(out.summary.patrimonio)+' USDT';
    setSign('ret',out.summary.retornoPct);setSign('hold',out.summary.holdPct);
    $('dd').textContent=USDT(out.summary.drawdownPct)+'%';
    $('trades').textContent=out.summary.executions.toLocaleString('pt-BR');
    $('fees').textContent=USDT(out.summary.taxas);
    $('funding').textContent=(out.summary.funding>0?'+':'')+USDT(out.summary.funding);
    $('liqs').textContent=out.summary.liquidations;
    $('exposure').textContent=USDT(out.summary.exposurePct)+'%';
    const rows=out.events.slice(-18).reverse();
    $('log').replaceChildren();
    if(!rows.length){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=4;td.textContent='Nenhuma execução neste período.';tr.append(td);$('log').append(tr);
    }
    for(const e of rows){
      const tr=document.createElement('tr');
      for(const v of [fmtDate(e.t),e.kind,USDT(e.price),Number(e.qty).toPrecision(5)]){
        const td=document.createElement('td');td.textContent=v;tr.append(td);
      }
      $('log').append(tr);
    }
    chart();
    $('error').textContent='';
  }catch(e){
    if(id!==loading)return;
    $('error').textContent=e.message||'Falha inesperada ao simular.';
    console.error(e);
  }finally{
    if(id===loading)$('simulate').disabled=false;
  }
}
function chart(){
  if(!current)return;
  const canvas=$('chart'),ctx=canvas.getContext('2d');
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(!(w>0&&h>0))return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const data=current.curve,margin={l:55,r:14,t:15,b:27},plotW=w-margin.l-margin.r,plotH=h-margin.t-margin.b;
  const values=data.flatMap(p=>[p.perp,p.hold]);
  let min=Math.min(...values),max=Math.max(...values);
  const spread=Math.max(20,max-min);min-=spread*.10;max+=spread*.10;
  chartRange={data,x0:margin.l,plotW};
  const y=v=>margin.t+(max-v)/(max-min)*plotH,x=i=>margin.l+i/(data.length-1)*plotW;
  ctx.font='11px system-ui';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let j=0;j<=4;j++){
    const yy=margin.t+plotH*j/4,v=max-(max-min)*j/4;
    ctx.strokeStyle='#2a3834';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(margin.l,yy);ctx.lineTo(w-margin.r,yy);ctx.stroke();
    ctx.fillStyle='#94a99d';ctx.fillText(Math.round(v).toLocaleString('pt-BR'),margin.l-8,yy);
  }
  for(let i=0;i<3;i++){
    const idx=Math.round((data.length-1)*i/2);
    ctx.textAlign=i===0?'left':i===2?'right':'center';
    ctx.fillStyle='#92a69f';ctx.fillText(fmtDate(data[idx].t).split(',')[0],x(idx),h-10);
  }
  const paint=(key,color)=>{
    ctx.beginPath();data.forEach((p,i)=>i?ctx.lineTo(x(i),y(p[key])):ctx.moveTo(x(i),y(p[key])));
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
  };
  paint('hold','#58d9e2');paint('perp','#ddff42');
  const idx=hover==null?data.length-1:Math.max(0,Math.min(data.length-1,hover));
  const point=data[idx],xx=x(idx);
  ctx.strokeStyle='#a4b7b07f';ctx.setLineDash([3,5]);ctx.beginPath();
  ctx.moveTo(xx,margin.t);ctx.lineTo(xx,margin.t+plotH);ctx.stroke();ctx.setLineDash([]);
  for(const [key,color] of [['perp','#ddff42'],['hold','#58d9e2']]){
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(xx,y(point[key]),4,0,Math.PI*2);ctx.fill();
  }
  $('chart-description').textContent=fmtDate(point.t)+' · Perps '+USDT(point.perp)+
    ' USDT · Spot '+USDT(point.hold)+' USDT · '+
    current.summary.hours.toLocaleString('pt-BR')+' candles simulados.'+
    ' Último candle histórico: '+fmtDate(current.summary.end-3600000)+'.';
}
const canvas=$('chart');
canvas.addEventListener('pointermove',event=>{
  if(!chartRange)return;
  const rect=canvas.getBoundingClientRect();
  const frac=Math.max(0,Math.min(1,(event.clientX-rect.left-chartRange.x0)/chartRange.plotW));
  hover=Math.round(frac*(chartRange.data.length-1));chart();
});
canvas.addEventListener('pointerleave',()=>{hover=null;chart();});
canvas.tabIndex=0;
canvas.addEventListener('keydown',event=>{
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();
  hover=Math.min(current.curve.length-1,Math.max(0,(hover??current.curve.length-1)+(event.key==='ArrowLeft'?-1:1)));
  chart();
});
window.addEventListener('resize',()=>chart());
for(const name of fields){
  const element=$(name);
  element.addEventListener('input',()=>{
    updateLabels();
    clearTimeout(pending);
    pending=setTimeout(recalc,180);
  });
  element.addEventListener('change',()=>{
    updateLabels();
    clearTimeout(pending);
    pending=setTimeout(recalc,80);
  });
}
$('simulate').addEventListener('click',()=>{clearTimeout(pending);recalc();});
updateLabels();
recalc();
