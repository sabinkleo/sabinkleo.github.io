/* Vértice Drops: public-source offer directory. No trackers, no APIs, no personal data. */
(()=>{'use strict';
const el=id=>document.getElementById(id);
const filters=document.querySelectorAll('button[data-filter]');
const cats=new Set(['all','dev','education','cloud','ai']);
let filter='all',items=[];
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));}
function validHttps(v){try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch{return null;}}
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function renderCard(o,today){
 const link=validHttps(o.url),source=validHttps(o.source_url);
 const ends=Boolean(o.expires_at);
 const soon=ends && o.expires_at>=today && (new Date(o.expires_at+'T00:00:00Z')-new Date(today+'T00:00:00Z'))<=14*864e5;
 return '<article class="offer">'+
 '<div class="o-top"><span class="o-provider">'+escapeHtml(o.provider)+'</span><span class="o-eyebrow'+(soon?' ending':'')+'">'+escapeHtml(soon?'ENCERRA '+o.expires_at:(o.type==='credits'?'CRÉDITOS CONDICIONAIS':o.type==='promo'?'PRAZO LIMITADO':'ACESSO GRATUITO'))+'</span></div>'+
 '<div class="o-headline">'+escapeHtml(o.headline)+'</div><h3>'+escapeHtml(o.name)+'</h3><p>'+escapeHtml(o.description)+'</p>'+
 '<div class="o-footer"><details class="o-terms"><summary>QUEM PODE USAR? + REGRAS</summary><p><strong>Elegibilidade:</strong> '+escapeHtml(o.eligibility)+'</p><p><strong>Condições:</strong> '+escapeHtml(o.conditions)+'</p><p><a href="'+escapeHtml(source)+'" target="_blank" rel="noopener noreferrer">Ler termos na origem ↗</a></p></details>'+
 '<div class="o-actions"><a class="btn" href="'+escapeHtml(link)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(o.cta)+' ↗</a><span class="date">CONFERIDO '+escapeHtml(o.verified_at)+'</span></div></div></article>';
}
function draw(){
 const today=localDate();
 const active=items.filter(o=>(!o.starts_at||o.starts_at<=today)&&(!o.expires_at||o.expires_at>=today));
 const selected=active.filter(o=>filter==='all'||o.category===filter);
 el('count').textContent=active.length+' BENEFÍCIOS NO CATÁLOGO';
 el('notice').textContent=selected.length+' RESULTADOS · DATA LOCAL '+today;
 el('offers').innerHTML=selected.map(o=>renderCard(o,today)).join('');
 el('empty').hidden=selected.length>0;
 filters.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
}
async function start(){
 try{
  const res=await fetch('./offers.json',{cache:'no-store'});
  if(!res.ok)throw Error('Falha HTTP '+res.status);
  const payload=await res.json();
  if(payload.schema_version!==1||!Array.isArray(payload.offers))throw Error('Catálogo incompatível');
  const used=new Set();
  for(const o of payload.offers){
   if(!o||used.has(o.id)||!cats.has(o.category)||!validHttps(o.url)||!validHttps(o.source_url)||!/^\d{4}-\d{2}-\d{2}$/.test(o.verified_at)||o.coupon_code!==null)throw Error('Entrada incompleta');
   used.add(o.id);
  }
  items=payload.offers;
  el('checked').textContent='REVISADO '+payload.updated_at;
  draw();
 }catch(e){
  el('count').textContent='CATÁLOGO INDISPONÍVEL';
  el('notice').textContent='Não foi possível carregar os benefícios. Atualize a página mais tarde.';
  el('empty').hidden=true;
 }
}
document.querySelector('.filters').addEventListener('click',e=>{
 const b=e.target.closest('button[data-filter]');
 if(!b||!cats.has(b.dataset.filter))return;
 filter=b.dataset.filter;draw();
});
start();
})();