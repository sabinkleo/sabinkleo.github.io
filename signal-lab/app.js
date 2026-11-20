/* Vértice Signal Lab — sem dependências, sem pixel e sem backend.
   Dados editoriais em signals.json. Não inferir ROI observado a partir do score. */
(function(){
'use strict';
const ROOT = 'https://github.com/sabinkleo/sabinkleo.github.io';
const KEY = 'vertice_signal_lab_shortlist_v1';
const get = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const categories = {compliance:'FISCAL / REGULAÇÃO',distribution:'CANAIS / REVENDA',automation:'AUTOMAÇÃO',acquisition:'AQUISIÇÃO',infra:'INFRA / DEV',research:'PESQUISA / CONTEÚDO'};
const phases = {agir:'AGIR AGORA',testar:'TESTAR',validar:'VALIDAR',observar:'OBSERVAR',descartar:'ARQUIVAR'};
const badges = {oficial:['FONTE OFICIAL','official'],interno:['ATIVO INTERNO','done'],parcial:['CHECAGEM PARCIAL','claim'],anuncio:['SÓ ANÚNCIO','claim']};
const evidenceWeight={oficial:4,interno:4,parcial:2,anuncio:1};
const state = {data:[],meta:null,category:'all',search:'',phase:'all',sort:'score',savedOnly:false,opened:new Set(),saved:new Set()};
try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); if(Array.isArray(saved)) state.saved = new Set(saved.filter(v=>typeof v==='string').slice(0,200)); }
catch(_) { /* Persistência opcional; não perder a função principal. */ }
function esc(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeUrl(value){
 try { const u=new URL(String(value));return u.protocol==='https:' ? u.href : '#'; }
 catch(_) {return '#';}
}
function calcScore(x){
 const nums=['potential','speed','cash','repeat','proof'].map(k=>Number(x[k]));
 if(nums.some(v=>!Number.isFinite(v)||v<1||v>5))return 0;
 return Math.round(20*(.30*nums[0]+.25*nums[1]+.20*nums[2]+.15*nums[3]+.10*nums[4]));
}
function statusText(x){
 const pair=badges[x.evidence]||['SEM VERIFICAÇÃO','claim'];
 return '<span class="pill '+pair[1]+'">'+pair[0]+'</span>';
}
function renderCard(x){
 const selected=state.saved.has(x.id),expanded=state.opened.has(x.id);
 const link=safeUrl(x.url);
 return '<article class="signal" data-id="'+esc(x.id)+'">'+
 '<div class="signal-top"><div class="signal-head"><div class="category">'+esc(categories[x.category]||x.category)+'</div><div class="score" title="Score editorial hipotético">'+calcScore(x)+'<small>/100</small></div></div>'+
 '<h3>'+esc(x.title)+'</h3><div class="maker">'+esc(x.maker)+' · '+esc(x.model)+'</div>'+
 '<p class="teaser">'+esc(x.why)+'</p></div>'+
 '<div class="signal-bottom"><div class="signal-labels">'+statusText(x)+'<span class="pill">'+esc(phases[x.phase]||x.phase)+'</span><span class="pill">'+esc(x.tag||x.priority)+'</span></div>'+
 '<div class="signal-buttons"><button type="button" class="action secondary" data-action="detail" aria-expanded="'+expanded+'" aria-controls="details-'+esc(x.id)+'">'+(expanded?'FECHAR':'ABRIR PLANO')+'</button>'+
 '<button type="button" class="action muted" data-action="save" aria-pressed="'+selected+'" aria-label="'+(selected?'Remover da shortlist':'Adicionar à shortlist')+'">'+(selected?'★ SALVO':'☆ SALVAR')+'</button></div></div>'+
 '<div class="details" id="details-'+esc(x.id)+'"'+(expanded?'':' hidden')+'><dl><dt>O que a fonte diz</dt><dd>'+esc(x.claim)+'</dd>'+
 '<dt>Mecanismo a adaptar</dt><dd>'+esc(x.mechanism)+'</dd>'+
 '<dt>Experimento mínimo</dt><dd>'+esc(x.test)+'</dd>'+
 '<dt>Risco / bloqueio</dt><dd>'+esc(x.risks)+'</dd>'+
 '<dt>Proveniência</dt><dd>'+esc(x.source)+' · '+(x.verified?'checado '+esc(x.verified):'afirmação não verificada independentemente')+'</dd></dl>'+
 (link!=='#'?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">ABRIR REFERÊNCIA ↗</a>':'')+'</div></article>';
}
function render(){
 let values=state.data.filter(x=>{
 const text=[x.title,x.maker,x.claim,x.mechanism,x.why,x.model,x.priority].join(' ').toLocaleLowerCase('pt-BR');
 return (state.category==='all'||state.category===x.category)&&
 (state.phase==='all'||state.phase===x.phase)&&
 (!state.savedOnly||state.saved.has(x.id))&&
 (!state.search||text.includes(state.search));
 });
 if(state.sort==='title')values.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
 else if(state.sort==='evidence')values.sort((a,b)=>(evidenceWeight[b.evidence]||0)-(evidenceWeight[a.evidence]||0)||calcScore(b)-calcScore(a));
 else values.sort((a,b)=>calcScore(b)-calcScore(a)||a.title.localeCompare(b.title,'pt-BR'));
 get('cards').innerHTML=values.map(renderCard).join('');
 get('empty').hidden=values.length!==0;
 get('catalogStatus').textContent=values.length+' DE '+state.data.length+' SINAIS · PRIORIDADE EDITORIAL, NÃO DEMANDA VERIFICADA';
 get('countSaved').textContent=state.saved.size;
 get('savedOnly').setAttribute('aria-pressed',String(state.savedOnly));
 get('savedOnly').textContent=state.savedOnly?'★ MOSTRANDO SALVOS':'☆ SHORTLIST';
 document.querySelectorAll('#filters button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===state.category)));
}
function persist(){
 try { localStorage.setItem(KEY,JSON.stringify([...state.saved])); }
 catch(_) { /* Browser sem armazenamento; shortlist apenas nesta sessão. */ }
}
async function load(){
 try{
  const response=await fetch('./signals.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const payload=await response.json();
  if(payload.schema_version!==1||!Array.isArray(payload.signals))throw new Error('Schema incompatível');
  const ids=new Set();
  for(const x of payload.signals){
   if(!x||!x.id||ids.has(x.id)||!categories[x.category]||!phases[x.phase]||!badges[x.evidence]||!safeUrl(x.url).startsWith('https:')||calcScore(x)===0)throw new Error('Entrada inválida: '+String(x?.id));
   ids.add(x.id);
  }
  state.meta=payload;
  state.data=payload.signals;
  get('countTotal').textContent=state.data.length;
  get('countOfficial').textContent=state.data.filter(x=>x.evidence==='oficial').length;
  get('countNow').textContent=state.data.filter(x=>x.phase==='agir'||x.phase==='testar').length;
  get('updated').textContent='ED. '+String(payload.updated_at||'—');
  render();
 } catch(error){
  get('catalogStatus').textContent='ERRO AO CARREGAR CATÁLOGO: '+String(error.message||error)+'. Recarregue a página.';
  get('cards').textContent='';
  get('empty').hidden=true;
 }
}
get('search').addEventListener('input',e=>{state.search=e.target.value.trim().toLocaleLowerCase('pt-BR');render();});
get('phase').addEventListener('change',e=>{state.phase=e.target.value;render();});
get('sort').addEventListener('change',e=>{state.sort=e.target.value;render();});
get('filters').addEventListener('click',e=>{
 const button=e.target.closest('button[data-category]');if(!button)return;
 if(!Object.hasOwn(categories,button.dataset.category)&&button.dataset.category!=='all')return;
 state.category=button.dataset.category;render();
});
get('savedOnly').addEventListener('click',()=>{state.savedOnly=!state.savedOnly;render();});
get('cards').addEventListener('click',e=>{
 const button=e.target.closest('button[data-action]');if(!button)return;
 const card=button.closest('article[data-id]');if(!card)return;
 const id=card.dataset.id;if(!state.data.some(x=>x.id===id))return;
 if(button.dataset.action==='detail'){state.opened.has(id)?state.opened.delete(id):state.opened.add(id);}
 if(button.dataset.action==='save'){state.saved.has(id)?state.saved.delete(id):state.saved.add(id);persist();}
 render();
 if(button.dataset.action==='detail'){const after=get('details-'+id);if(after&&!after.hidden)after.scrollIntoView({block:'nearest',behavior:'instant'});}
});
function updateModel(){
 const number=id=>{const n=Number(get(id).value);return Number.isFinite(n)?Math.max(0,Math.min(n,1e6)):0;};
 const price=number('setup')+number('monthly')-number('variable')-number('cac');
 const hours=number('hours')+number('support');
 get('perHour').textContent=hours>0?fmt.format(price/hours):'—';
 get('resultHelp').textContent=hours>0?'Contribuição: '+fmt.format(price)+' · '+hours.toLocaleString('pt-BR')+' h':'Defina horas maiores que zero';
}
document.querySelectorAll('.model input').forEach(el=>el.addEventListener('input',updateModel));
updateModel();
get('suggest').addEventListener('submit',e=>{
 e.preventDefault();
 const title=get('suggestTitle').value.trim(),url=get('suggestUrl').value.trim(),test=get('suggestTest').value.trim();
 if(!title||!test)return;
 if(url&&safeUrl(url)==='#'){get('suggestUrl').setCustomValidity('Use URL HTTPS');get('suggestUrl').reportValidity();return;}
 get('suggestUrl').setCustomValidity('');
 const body=['## Pista capturada no Signal Lab','','**Fonte:** '+(url||'A adicionar'),'', '**Mecanismo e teste sugerido:**',test,'','## Verificação pendente','- [ ] Origem e titularidade da fonte','- [ ] Demanda validada com cliente real','- [ ] Custos de execução, licença e riscos','- [ ] Teste barato definido','- [ ] Não copiar criativo, identidade ou dados de terceiros'].join('\n');
 const target=ROOT+'/issues/new?title='+encodeURIComponent('[Signal] '+title)+'&body='+encodeURIComponent(body);
 window.open(target,'_blank','noopener,noreferrer');
});
get('suggestUrl').addEventListener('input',()=>get('suggestUrl').setCustomValidity(''));
get('export').addEventListener('click',()=>{
 const picked=state.data.filter(x=>state.saved.has(x.id));
 if(!picked.length){get('catalogStatus').textContent='SHORTLIST VAZIA. SALVE PELO MENOS UMA PISTA ANTES DE EXPORTAR.';return;}
 const payload={exported_at:new Date().toISOString(),source:'Vértice Signal Lab',notes:'Hipóteses; não representam vendas ou ROI comprovado.',signals:picked};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download='vertice-signal-lab-shortlist.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
load();
})();
