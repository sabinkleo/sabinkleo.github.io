// Only catalog entries cross the network. Raw visitor text stays in the browser.
export const catalogs = {
  'auto-telemetry': ['ECU','FTManager','FT450','FT550','FT600','FuelTech','dyno','knock','AFR','boost','turbo','Golf','Civic','Gol','AP','EA888','K20','B16','2JZ','1JZ','Chevette','Opala','Corolla','intercooler','supercharger','injectors','bicos','motor','carro','wideband'],
  'linux-security': ['Linux','Ubuntu','Debian','SSH','root','ingress','firewall','servidor','UFW','iptables','password','senha'],
  'ai-ops': ['Gemini','NVIDIA','LLM','OpenRouter','429','cache','tokens','latency','latência','quota','retry','failover']
};
const gaps = ['single-key','no-cache','paid-routing','public-ingress','root-login','password-auth','lean-boost','knock-events','boost-peak'];
const sales = ['WhatsApp','Google Maps','mobile','reviews','avaliações','checkout','agendamento'];
const events = ['quota','outage','knock'];
export const modes = ['Cirúrgico','Cavalo de Troia','Contra-Intuitivo','Modo Caos Controlado'];
export function extract(text, preset) {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const found = Object.entries(catalogs).map(([v, terms]) => [v, terms.filter(t => words.includes(t.toLowerCase()))]);
  const vertical = preset || [...found].sort((a,b)=>b[1].length-a[1].length).find(x=>x[1].length)?.[0] || 'ai-ops';
  const year = words.find(w=>/^(?:19[6-9]\d|20[0-3]\d)$/.test(w));
  return {vertical, entities:[...new Set([...found.flatMap(x=>x[1]),...sales.filter(t=>text.toLowerCase().includes(t.toLowerCase())),...(year && vertical==='auto-telemetry'?[year]:[])])]};
}
export function valid(p) {
  const allowed = new Set(['action','vertical','entities','lang','findings','checks','event','mode','remix']);
  return p && typeof p === 'object' && Object.keys(p).every(k=>allowed.has(k)) &&
    ['intent','intake','crm_hypothesis','teardown_audit'].includes(p.action) && Object.hasOwn(catalogs,p.vertical) &&
    ['en','pt'].includes(p.lang) && Array.isArray(p.entities) && p.entities.length<=60 &&
    p.entities.every(e=>[...Object.values(catalogs).flat(),...sales].includes(e) || (typeof e==='string' && /^(?:19[6-9]\d|20[0-3]\d)$/.test(e))) &&
    (!('findings' in p) || (Array.isArray(p.findings) && p.findings.length<=9 && p.findings.every(g=>gaps.includes(g)))) &&
    (!('checks' in p) || (Number.isInteger(p.checks) && p.checks>=0 && p.checks<=100)) &&
    (!('event' in p) || events.includes(p.event)) && (!('mode' in p) || modes.includes(p.mode)) &&
    (!('remix' in p) || (Number.isInteger(p.remix) && p.remix>=0 && p.remix<1000)) &&
    (p.action!=='teardown_audit' || (p.entities.length===0 && Array.isArray(p.findings) && Number.isInteger(p.checks)));
}
const steps = {
  'ai-ops':['Replay one quota failure and time the next healthy response','Count duplicate prompts in a representative batch','Compare billed tokens before and after scoped reuse'],
  'linux-security':['Verify named access and recovery on a test host','Match public listeners to approved services','Compare effective authentication policy with recent login events'],
  'auto-telemetry':['Align RPM and pressure channels on one recorded pull','Compare measured AFR with the logged target','Review knock indications and sensor validity with the calibrator']
};
const ptSteps = {
  'ai-ops':['Reproduza uma falha de quota e cronometre a recuperação','Conte prompts repetidos em um lote','Compare os tokens cobrados antes e depois do cache'],
  'linux-security':['Valide acesso nominal e recuperação em homologação','Confira as portas públicas com o responsável','Compare a política de autenticação com os registros de acesso'],
  'auto-telemetry':['Alinhe RPM e pressão em uma puxada gravada','Compare AFR medido e alvo registrado','Revise os sinais de detonação com o preparador']
};
export function localResult(p) {
  const pt=p.lang==='pt', priorities=(pt?ptSteps:steps)[p.vertical], setup=p.entities.join(', ') || p.vertical;
  const route='/en/'+p.vertical+'/';
  const narration = {quota:'The primary exhausted its request quota. Open the circuit until cooldown and replay on the next healthy provider.',outage:'The primary stopped serving requests. Move the next batch to the healthy route and probe recovery after cooldown.',knock:'The replay flags knock correction under load. Compare the recorded AFR and pressure traces before reviewing the pull with the calibrator.'};
  const alternates={
    quota:['A 429 marks a full quota window. Route the next request around it and probe after the reset.','Retries can consume the next quota window too. Cap attempts and compare healthy-route latency.'],
    outage:['A dead primary stalls the queue behind it. Trip its breaker and test one request on the alternate.','Treat the first recovered response as a probe. Restore traffic only after the primary stays healthy.'],
    knock:['The knock trace climbs at this point in the pull. Align the recorded AFR and boost channels at the same RPM.','One flagged sample cannot identify a sensor fault. Compare adjacent RPM cells and confirm the trace with the calibrator.']
  };
  const eventLine=p.event?[narration[p.event],...alternates[p.event]][(p.remix||0)%3]:'';
  const quick_reply=p.event?eventLine:[setup,priorities[0]].join('\n');
  if(p.action==='intent') return {vertical:p.vertical,urgency:p.entities.some(x=>['knock','429','root'].includes(x))?'high':'review',extracted_entities:p.entities,recommended_route:route,quick_reply};
  const unknown=pt?'não informado':'unspecified';
  const match=words=>p.entities.filter(x=>words.includes(x)).join(', ')||unknown;
  const fields=p.vertical==='auto-telemetry'?{
    car:match(['Golf','Gol','Civic','Chevette','Opala','Corolla']),year:p.entities.find(x=>/^\d{4}$/.test(x))||unknown,
    engine:match(['AP','EA888','K20','B16','2JZ','1JZ']),ecu:match(['FTManager','FT450','FT550','FT600','FuelTech','ECU']),
    upgrades:match(['turbo','injectors','bicos','intercooler','supercharger'])
  }:{stack:setup,symptoms:match(['root','429','retry','senha','password','quota','latency','latência'])};
  if(p.action==='intake') return {detected_setup:setup,fields,risk_score:Math.min(100,25*p.entities.filter(e=>['knock','429','root','password','senha','quota','retry'].includes(e)).length),priorities,plan:priorities.map((s,i)=>['01–07','08–20','21–30'][i]+' · '+s),whatsapp_summary:[setup,...priorities].join('\n')};
  const signal=(p.findings?.length?p.findings:p.entities).join(', ') || (pt?'trajeto até o contato':'handoff path');
  const variants=pt?[
    ['Quantos passos existem em '+signal+'?','Cronometrar o fluxo e testar uma mudança em 20 minutos.','Posso te mostrar onde o cronômetro para em '+signal+'?'],
    ['O atrito em '+signal+' precisa ficar visível.','Gravar 12 segundos de uma tentativa real.','Te mando uma gravação de 12 segundos percorrendo '+signal+'?'],
    ['Mais volume pode repetir o atrito em '+signal+'.','Comparar duas tentativas antes de ampliar tráfego.','E se a próxima conversão vier dos acessos que você já tem?']
  ]:[
    ['Measure the delay at '+signal+'.','Time one pass and test one change in 20 minutes.','Can we time one pass through '+signal+'?'],
    ['Make '+signal+' visible on replay.','Record a 12-second trace of the handoff.','Would a 12-second replay help isolate '+signal+'?'],
    ['More traffic could amplify '+signal+'.','Compare two runs before increasing volume.','What changes if we fix one repeat before adding capacity?']
  ];
  const angles=variants.map(([observable_friction,concrete_offer,whatsapp_hook],i)=>({name:modes[i],observable_friction,concrete_offer,whatsapp_hook}));
  const choice=Math.max(0,modes.indexOf(p.mode))+(p.remix||0);
  const selected=angles[choice%3];
  if(p.action==='crm_hypothesis') return {...selected,angles};
  return {executive_narrative:signal+' · '+selected.observable_friction,remediation_diff:[selected.concrete_offer,...priorities],roi_justification:'Compare elapsed time and cost on equal volumes before assigning savings.',angles};
}
const ban=/simplifica o primeiro contato|otimizar presença|peça focada|impacto desconhecido/i;
export function accepted(p,v) {
  const shape=localResult(p);
  function check(a,b){
    if(Array.isArray(a)) return Array.isArray(b) && b.length===a.length && b.every((x,i)=>check(a[i],x));
    if(a && typeof a==='object') return b && typeof b==='object' && Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(k=>Object.hasOwn(b,k)&&check(a[k],b[k]));
    if(typeof a==='number') return Number.isInteger(b)&&b>=0&&b<=100;
    return typeof b==='string'&&b.trim().length>0&&b.length<=700&&!/[<>\u0000-\u0008]/.test(b)&&!ban.test(b.normalize('NFKC').replace(/\s+/g,' '));
  }
  return check(shape,v) && (p.action!=='intent'||(Object.hasOwn(catalogs,v.vertical)&&v.recommended_route==='/en/'+v.vertical+'/'&&['high','review'].includes(v.urgency)&&v.extracted_entities.every(e=>p.entities.includes(e)))) &&
    (!shape.angles || (v.angles.every((a,i)=>a.name===modes[i]) && new Set(v.angles.map(a=>a.whatsapp_hook.toLowerCase())).size===3));
}
