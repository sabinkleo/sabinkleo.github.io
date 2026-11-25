import { whileVisible } from './visibility';
function router(root: HTMLElement) {
  const names = ['Gemini', 'NVIDIA NIM', 'OpenRouter', 'FreeLLMAPI'];
  const until = names.map(() => 0);
  const nodes = [...root.querySelectorAll<SVGGElement>('[data-provider]')];
  const paths = nodes.map(node => node.querySelector('path')!);
  const lengths = paths.map(p => p.getTotalLength());
  const packet = root.querySelector('circle')!;
  const metrics = root.querySelectorAll('output');
  const trace = root.querySelector('pre')!;
  const breaker = root.querySelector<HTMLElement>('[data-breaker]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let provider = -1, tokens = 0, sequence = 0, started = 0, duration = 0;
  let timer = 0, frame = 0;
  const history: string[] = [];
  function log(event: string, fields: object) {
    history.push(JSON.stringify({seq: ++sequence, event, ...fields}));
    if (history.length > 24) history.shift();
    trace.textContent = history.join('\n'); trace.scrollTop = trace.scrollHeight;
  }
  function route(now: number) {
    until.forEach((end,i) => {
      if (end && end <= now) { until[i] = 0; log('circuit.closed', {provider:names[i]}); }
    });
    provider = until.findIndex(end => !end);
    nodes.forEach((node,i) => node.dataset.state = until[i] ? 'open' : i === provider ? 'active' : 'standby');
    metrics[0].value = names[provider] ?? 'Waiting';
    const open = until.flatMap((end,i) => end ? [names[i]+' '+Math.ceil((end-now)/1000)+'s'] : []);
    breaker.textContent = open.length ? 'Cooldown · '+open.join(' / ') : 'All circuits closed';
    packet.style.visibility = provider < 0 || reduced.matches ? 'hidden' : 'visible';
  }
  function tick() {
    const now = performance.now();
    const previous = provider;
    route(now);
    if (previous !== provider) { started = 0; log('route.selected', {provider:names[provider] ?? null}); }
    if (provider < 0) { metrics[1].value = '—'; return; }
    if (!started || now-started >= duration) {
      if (started) {
        tokens += 48 + sequence % 51;
        log('crm.ack', {provider:names[provider], latency_ms: Math.round(duration/8), tokens, cost_usd:0});
      }
      started = now; duration = 1050 + provider*250 + sequence%7*30;
    }
    metrics[1].value = Math.round((now-started)/8)+' ms'; metrics[2].value = String(tokens);
  }
  function draw(now:number) {
    if (!reduced.matches && provider >= 0 && started) {
      const progress = Math.min(1,(now-started)/duration);
      const distance = progress * (275+lengths[provider]);
      const point = distance < 275 ? {x:64+distance,y:125} : paths[provider].getPointAtLength(distance-275);
      packet.setAttribute('cx',String(point.x)); packet.setAttribute('cy',String(point.y));
    }
    if (!reduced.matches) frame = requestAnimationFrame(draw);
  }
  function trip(i:number, status:number, seconds:number) {
    if (i < 0) return;
    until[i] = performance.now()+seconds*1000;
    log('circuit.open', {provider:names[i], status, cooldown_ms:seconds*1000});
    tick();
  }
  root.querySelector('[data-rate]')!.addEventListener('click',()=>trip(provider,429,8));
  root.querySelector('[data-kill]')!.addEventListener('click',()=>trip(0,503,18));
  function schedule() {
    cancelAnimationFrame(frame);
    if (timer && !reduced.matches) frame = requestAnimationFrame(draw);
  }
  reduced.addEventListener('change',schedule);
  whileVisible(root,active=>{
    clearInterval(timer); timer=0; started=0;
    if (active) { tick(); timer=window.setInterval(tick,120); }
    schedule();
  });
}
export default Object.assign(router,{nativeDiagnostic:true});
