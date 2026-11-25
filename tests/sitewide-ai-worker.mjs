import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,quota} from '../infra/triage/gateway.mjs';
import {extract,localResult,accepted,valid} from '../assets/ai-contract.mjs';
const base={lang:'en',vertical:'ai-ops',entities:['429']};
for(const action of ['intent','intake','crm_hypothesis','teardown_audit']){
  test(action+' accepts structured gateway output and works offline',async()=>{
    const p={...base,action,...(action==='teardown_audit'?{entities:[],findings:['no-cache'],checks:3}:{})};
    const local=await generate(p,{});
    assert.equal(local.source,'local');
    const response=await generate(p,{GEMINI_API_KEY:'fixture'},async()=>Response.json({choices:[{message:{content:JSON.stringify(local.result)}}]}));
    assert.equal(response.source,'gateway');assert.deepEqual(response.result,local.result);
  });
}
test('rejects each banned phrase across nested CRM fields',async()=>{
  const p={...base,action:'crm_hypothesis'};
  for(const phrase of ['simplifica o primeiro contato','otimizar presença','peça focada','impacto desconhecido']){
    const bad=localResult(p);bad.angles[1].concrete_offer=phrase;
    const reply=await generate(p,{GEMINI_API_KEY:'fixture'},async()=>Response.json({choices:[{message:{content:JSON.stringify(bad)}}]}));
    assert.equal(reply.source,'local');assert.ok(!JSON.stringify(reply.result).includes(phrase));
  }
});
test('per-IP binding gates quota and fails closed',async()=>{
  const keys=new Set(),env={AI_RATE_LIMITER:{async limit({key}){const success=!keys.has(key);keys.add(key);return {success};}}};
  for(const [ip,expected] of [['a',true],['a',false],['b',true]]){
    assert.equal(await quota(new Request('https://example.test',{headers:{'CF-Connecting-IP':ip}}),env),expected);
  }
  assert.equal(await quota(new Request('https://example.test'),{}),false);
});
test('429 advances to the next configured provider before offline fallback',async()=>{
  const p={...base,action:'intake'},seen=[];
  const mock=async url=>{seen.push(new URL(url).hostname);return new Response(null,{status:429});};
  const result=await generate(p,{GEMINI_API_KEY:'x',NVIDIA_API_KEY:'y'},mock);
  assert.deepEqual(seen,['generativelanguage.googleapis.com','integrate.api.nvidia.com']);assert.equal(result.source,'local');
});
test('rejects free text, external routes, unrecognized findings and unsafe output',()=>{
  const p={...base,action:'intent'};
  assert.deepEqual(extract('Linux SSH senha=private-example').entities,['Linux','SSH','senha']);
  assert.ok(!valid({...p,raw:'secret'}));assert.ok(!valid({...p,entities:['secret']}));
  assert.ok(!valid({...p,action:'teardown_audit',findings:['private-domain'],checks:1}));
  const reply=localResult(p);
  assert.ok(!accepted(p,{...reply,recommended_route:'https://example.test'}));
  assert.ok(!accepted(p,{...reply,quick_reply:'<img onerror=alert(1)>'}));
});

test('HTTP entry points cap bytes, gate each IP and preserve triage',async()=>{
  const {createServer}=await import('vite');
  const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
  try{
    const worker=(await server.ssrLoadModule('/infra/triage/worker.ts')).default;
    const env={AI_RATE_LIMITER:{limit:async({key})=>({success:key==='allowed'})}};
    const post=(data,path='/api/ai',ip='allowed',accept='application/json')=>worker.fetch(new Request('https://example.test'+path,{
      method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,Accept:accept},body:JSON.stringify(data)
    }),env);
    for(const p of [{...base,action:'intent'},{...base,action:'intake'},{...base,action:'crm_hypothesis'},{...base,action:'teardown_audit',entities:[],checks:1,findings:['no-cache']}]){
      assert.equal((await post(p)).status,200);
      assert.equal((await post(p,'/api/ai','blocked')).status,429);
    }
    const intent=await (await post({action:'intent',lang:'pt',text:'FT550 turbo private-example'})).json();
    assert.equal(intent.result.vertical,'auto-telemetry');
    assert.doesNotMatch(JSON.stringify(intent),/private-example/);
    assert.equal((await post({...base,action:'intent',text:'x'.repeat(5000)})).status,400);
    const stream=await post({...base,action:'intent',event:'quota'},'/api/ai','allowed','application/x-ndjson');
    assert.equal(stream.headers.get('content-type'),'application/x-ndjson');
    assert.match((await stream.text()).trim().split('\n').map(s=>JSON.parse(s).text).join(''),/quota/);
    assert.equal((await post({vertical:'invalid'},'/api/triage')).status,400);
    assert.equal((await post({},'/unknown')).status,404);
  }finally{await server.close();}
});
