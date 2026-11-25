import {accepted, extract, localResult, valid} from './ai-contract.mjs';
export {extract};
export async function ask(p,display){
  if(!valid(p)) throw new Error('Unsupported diagnostic signals');
  const fallback=localResult(p);
  display(fallback,'local');
  try{
    const response=await fetch('/api/ai',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',
      headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(9500),body:JSON.stringify(p)});
    if(!response.ok) return;
    const {result,source}=await response.json();
    if(accepted(p,result)) display(result,source==='gateway'?'gateway':'local');
  }catch{/* The local readout is already available. */}
}
export function anglesText(result){
  return result.angles.map(a=>[a.name,a.observable_friction,a.concrete_offer,a.whatsapp_hook].join('\n')).join('\n\n');
}
export function mountEntry(root){
  const pt=document.documentElement.lang.startsWith('pt'), lang=pt?'pt':'en';
  const t=(en,br)=>pt?br:en;
  const action=root.dataset.aiEntry;
  const input=document.createElement('textarea'), button=document.createElement('button'), out=document.createElement('pre'), link=document.createElement('a'), copy=document.createElement('button');
  const label=action==='intent'?t('Ask / Route with AI','Perguntar / encontrar trilha'):t('Free-text intake','Diagnóstico em texto livre');
  input.setAttribute('aria-label',label);input.placeholder=label;input.rows=2;input.maxLength=2500;
  button.type=copy.type='button';button.textContent=action==='intent'?t('Preview route','Ver trilha'):t('Analyze setup','Analisar setup');
  out.setAttribute('role','status'); link.hidden=copy.hidden=true;copy.textContent=t('Copy Markdown','Copiar Markdown');
  root.append(input,button,out,link,copy);
  let ticket=0, markdown='';
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(markdown);}catch{const range=document.createRange();range.selectNodeContents(out);getSelection()?.removeAllRanges();getSelection()?.addRange(range);}};
  if(action==='intake') input.value=extract(new URLSearchParams(location.search).get('context')||'',root.dataset.vertical).entities.join(' ');
  function clear(){ticket++;out.textContent='';link.hidden=copy.hidden=true;}
  input.oninput=clear;
  button.onclick=()=>{
    clear();if(!input.value.trim()){input.focus();return;}
    const token=ticket, signals=extract(input.value,root.dataset.vertical);
    ask({action,lang,...signals},(v,source)=>{
      if(token!==ticket)return;
      if(action==='intent'){
        const url=new URL(v.recommended_route,location.origin);url.searchParams.set('context',signals.entities.join(' '));url.hash='intake';
        link.href=url.href;link.textContent=t('Open ','Abrir ')+v.vertical;
        out.textContent=v.vertical+' · '+v.urgency+'\n'+v.quick_reply.replace(/\s+/g,' ');
      }else{
        markdown=['## '+v.detected_setup,t('Risk','Risco')+' '+v.risk_score+'/100',...v.priorities.map(x=>'- '+x),'',...v.plan].join('\n');
        out.textContent=markdown;link.href='https://wa.me/5541998844684?text='+encodeURIComponent(v.whatsapp_summary);link.textContent='WhatsApp';copy.hidden=false;
      }
      root.dataset.source=source;link.hidden=false;
    });
  };
}
