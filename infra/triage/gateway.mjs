import {valid, localResult, accepted, modes} from '../../assets/ai-contract.mjs';

const framing = {
  intent:'Route the observed symptoms. Write two short lines: cause to investigate and next measurement. For a simulator event give exactly two sentences.',
  intake:'Parse the observed setup. Give exactly three testable bottlenecks and schedule their checks across 30 days. Distinguish suspected risk from measurement.',
  teardown_audit:'Use only aggregate checks and finding codes. Supply an executive narrative, ordered before/after changes and a falsifiable ROI test. Never invent measured savings.',
  crm_hypothesis:'Write in Brazilian Portuguese. Ban simplifica o primeiro contato, otimizar presença, peça focada and impacto desconhecido. Phrase unmeasured friction as a question.'
};
export async function generate(p,env,send=fetch) {
  if(!valid(p)) throw new TypeError('Invalid action payload');
  const result=localResult(p);
  const providers=[
    [env.GEMINI_API_KEY,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',env.GEMINI_MODEL||'gemini-2.5-flash-lite'],
    [env.NVIDIA_API_KEY,'https://integrate.api.nvidia.com/v1/chat/completions',env.NVIDIA_MODEL||'meta/llama-3.3-70b-instruct'],
    [env.FREELM_API_KEY,env.FREELM_CHAT_URL,env.FREELM_MODEL||'tier-smart'],
    [env.OPENROUTER_API_KEY,'https://openrouter.ai/api/v1/chat/completions','openrouter/free']
  ];
  for(const [key,url,model] of providers){
    if(!key || !url?.startsWith('https://')) continue;
    try {
      const response=await send(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(2200),
        headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({model,temperature:p.mode===modes[3]?0.9:0.75,max_tokens:1300,
          response_format:{type:'json_object'},messages:[
            {role:'system',content:framing[p.action]+' Use the requested language. Write like an engineer. Return only JSON matching the supplied example, preserving angle names and array sizes. Give three different angles where specified: one measured pain and 20-minute fix, one unexpected micro-deliverable, one contrarian test. Make the selected mode lead. Use the remix index to vary the hook. No invented evidence.'},
            {role:'user',content:JSON.stringify({signals:p,example:result})}]})});
      if(!response.ok) continue;
      const data=await response.json();
      const candidate=JSON.parse(data.choices[0].message.content);
      if(accepted(p,candidate)) return {source:'gateway',result:candidate};
    } catch { /* Try the next free route. */ }
  }
  return {source:'local',result};
}
export async function quota(request,env){
  if(!env.AI_RATE_LIMITER) return false;
  try {return (await env.AI_RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success===true;}
  catch {return false;}
}
