import { verticals } from '../../src/data/diagnostics';
import { assess } from '../../src/data/diagnostics/score';

import {generate, quota, eventStream} from './gateway.mjs';
import {valid,extract} from '../../assets/ai-contract.mjs';

interface Env {
  TRIAGE_GATEWAY_URL?: string;
  TRIAGE_GATEWAY_KEY?: string;
  TRIAGE_MODEL?: string;
}

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

async function readPayload(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let bytes = 0;
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.length;
    if (bytes > limit) {
      await reader.cancel();
      throw new Error('Request too large');
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (!['/api/triage','/api/ai'].includes(path)) return reply({ error: 'Unknown route' }, 404);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply({ error: 'Expected JSON' }, 415);
    let payload;
    try { payload = await readPayload(request, path === '/api/ai' ? 4096 : 1024); }
    catch { return reply({ error: 'Invalid or oversized JSON' }, 400); }
    if (path === '/api/ai') {
      if (payload && ['intent','intake'].includes(payload.action) && typeof payload.text==='string' && payload.text.length<=2500) {
        const {text,...fields}=payload;
        payload={...fields,...extract(text,fields.vertical)};
      }
      if (!valid(payload)) return reply({error:'Invalid action payload'}, 400);
      if (!await quota(request, env)) return reply({error:'Rate limited'}, 429);
      const output=await generate(payload,env);
      if(payload.action==='intent' && payload.event && request.headers.get('Accept')==='application/x-ndjson')return eventStream(output);
      return reply(output);
    }
    const spec = verticals.find(v => v.slug === payload?.vertical);
    if (!spec) return reply({ error: 'Unknown vertical' }, 400);
    let result;
    try { result = assess(spec, payload.answers); }
    catch { return reply({ error: 'Invalid evidence levels' }, 400); }
    const fallback = { score: result.score, note: result.priorities[0].fix, source: 'local' };
    if (!await quota(request, env) || !env.TRIAGE_GATEWAY_URL || !env.TRIAGE_GATEWAY_KEY || !env.TRIAGE_MODEL) return reply(fallback);
    try {
      const endpoint = new URL(env.TRIAGE_GATEWAY_URL);
      if (endpoint.protocol !== 'https:') return reply(fallback);
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000),
        headers: { Authorization: 'Bearer ' + env.TRIAGE_GATEWAY_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: env.TRIAGE_MODEL, max_tokens: 100,
          messages: [{ role: 'system', content: 'Summarize the first review priority in two sentences using only the supplied report.' },
                     { role: 'user', content: result.report }] }),
      });
      if (!response.ok) return reply(fallback);
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const note = data.choices?.[0]?.message?.content;
      return typeof note === 'string' && note.trim()
        ? reply({ score: result.score, note: note.trim().slice(0, 600), source: 'gateway' }) : reply(fallback);
    } catch { return reply(fallback); }
  },
};
