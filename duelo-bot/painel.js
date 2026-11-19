import { grafico } from './grafico.js';
const el=id=>document.getElementById(id);
const numero=(v,casas=2)=>v==null?'—':v.toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas});
const moeda=v=>numero(v)+' USDT';
const percentual=v=>v==null?'—':numero(v)+'%';
const formatos=Object.fromEntries(Object.entries({
  longo:{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'},
  dia:{day:'2-digit',month:'2-digit'},hora:{hour:'2-digit',minute:'2-digit'},
  curto:{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}
}).map(([k,op])=>[k,new Intl.DateTimeFormat('pt-BR',{...op,timeZone:'America/Sao_Paulo'})]));
const horario=(t,formato='longo')=>formatos[formato].format(t);
const curva=grafico(el('curvas'),el('leitura'),moeda,horario);
const linhas=[
  ['Patrimônio','patrimonio_usdt',moeda],['Retorno total','retorno_pct',percentual],
  ['Drawdown máximo','drawdown_max_pct',percentual],['Sharpe anualizado','sharpe',numero],
  ['Operações','trades',v=>numero(v,0)],['Tempo em posição','tempo_em_posicao_pct',percentual],
  ['Taxas pagas','taxas_usdt',moeda],['Diferença vs. hold','diferenca_hold_pp',v=>numero(v)+' p.p.']
];
let modo='backtest', fase='teste', pedido=0, historico;
const local='../bot/', raw='https://raw.githubusercontent.com/sabinkleo/sabinkleo.github.io/main/bot/';
const producao=['verticelabs.me','www.verticelabs.me','sabinkleo.github.io'].includes(location.hostname);
function linha(valores,celula='td'){
  const tr=document.createElement('tr');
  for(const v of valores){const td=document.createElement(celula);td.textContent=v;tr.append(td);}
  return tr;
}
function operacoes(lista) {
  const area=el('operacoes');area.replaceChildren();
  if (!lista.length){area.textContent='Nenhuma operação do bot neste período.';return;}
  const tabela=document.createElement('table'), cab=tabela.createTHead(), corpo=tabela.createTBody();
  cab.append(linha(['Data (BRT)','Par','Ação','Preço (USDT)'],'th'));
  for(const op of lista) corpo.append(linha([horario(op.t,'curto'),op.par,op.acao,numero(op.preco)]));
  area.append(tabela);
}

// O paper usa o JSON versionado em main: commits do token do Actions podem não republicar o Pages.
async function json(url) {
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw Error('HTTP '+r.status);
  const j=await r.json();
  if(j.versao!==1) throw Error('Formato inesperado');
  return j;
}
async function mostrar() {
  const id=++pedido, papel=modo==='paper';
  for(const k of ['paper','backtest','treino','teste']) el(k).setAttribute('aria-pressed',String(k===modo||k===fase));
  el('amostras').hidden=papel;el('relatorio').hidden=true;el('repetir').hidden=true;
  el('estado').hidden=false;el('estado').textContent='Carregando resultados…';
  try {
    let url=local+'results/'+modo+'.json', raizDados=local, aviso='', j;
    if(papel && producao) {
      try {j=await json(raw+'results/paper.json');url=raw+'results/paper.json';raizDados=raw;}
      catch {j=await json(url);aviso='A consulta ao GitHub falhou. Exibindo a cópia do site.';}
    } else if(papel) j=await json(url);
    else j=historico ??= await json(url);
    if(id!==pedido) return;
    const r=papel?j:j[fase];
    if(!r.curva?.length || !r.metricas?.bot || !r.metricas?.hold) throw Error('Resultado incompleto');
    el('titulo').textContent=papel?'Simulação ao vivo':fase==='teste'?'Teste reservado':'Treino da estratégia';
    el('periodo').textContent=horario(r.inicio)+' — '+horario(r.fim)+' (Brasília)';
    for(const lado of ['bot','hold']) {
      el('ret-'+lado).textContent=percentual(r.metricas[lado].retorno_pct);
      el('saldo-'+lado).textContent=moeda(r.metricas[lado].patrimonio_usdt);
    }
    el('metricas').replaceChildren(...linhas.map(([nome,k,fmt])=>linha([nome,fmt(r.metricas.bot[k]),fmt(r.metricas.hold[k])])));
    operacoes(r.ultimas_operacoes);
    el('veredito').textContent=papel||fase==='teste'?j.veredito:'Ajuste dos parâmetros nos primeiros '+r.intervalos.toLocaleString('pt-BR')+' candles. O teste reservado mostra o resultado fora da amostra.';
    const fontes=papel?Object.values(j.fontes):j.fontes;
    const origem=[...new Set(fontes)].map(x=>x==='v5'?'Bybit v5':'gráfico spot público da Bybit').join(' e ');
    const descricao=papel?'Patrimônio marcado na abertura.':'Patrimônio marcado no fechamento. Taxa '+percentual(j.taxa*100)+' e slippage '+percentual(j.slippage*100)+' por operação.';
    el('contexto').textContent=j.pares.join(' · ')+' | '+j.intervalo_minutos+' min | '+moeda(j.capital)+' iniciais por carteira. '+descricao+' Fonte: '+origem+'.';
    if(papel && Date.now()-r.fim>2*j.intervalo_minutos*60000) aviso+=' Atualização atrasada. A última abertura processada foi '+horario(r.fim)+' (Brasília).';
    el('baixar').href=url;el('csv').textContent=papel?'Operações em CSV ↗':'Curva em CSV ↗';
    el('csv').href=papel?raizDados+'state/trades.csv':local+'results/patrimonio.csv';
    el('estado').textContent=aviso.trim();el('estado').hidden=!aviso;el('repetir').hidden=!aviso;
    el('relatorio').hidden=false;curva(r.curva);
  } catch {
    if(id!==pedido) return;
    el('estado').textContent='Não foi possível carregar estes resultados. Tente novamente em instantes.';
    el('repetir').hidden=false;
  }
}
for(const k of ['paper','backtest']) el(k).addEventListener('click',()=>{modo=k;mostrar();});
for(const k of ['treino','teste']) el(k).addEventListener('click',()=>{fase=k;mostrar();});
el('repetir').addEventListener('click',mostrar);
setInterval(()=>{if(modo==='paper'&&!document.hidden) mostrar();},60000);
mostrar();
