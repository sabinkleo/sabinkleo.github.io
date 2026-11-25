import {ask, anglesText} from '../../assets/ai-client.mjs';
import { analyze, maxBytes } from './analyze';
import { baseline, clean, defaultCompany, isVertical, money, readBrief, shareLink, tracks } from './model';
import type { Analysis, Brief, Roadmap, Vertical } from './model';

const formats: Record<Vertical, string> = {
  'ai-ops': 'CSV or JSON · provider, request_hash, cache_hit, cost_usd, free_tier_eligible. Each row represents one request.',
  'linux-security': 'Paste global sshd_config directives or active ufw status output. Includes and conditional policies need separate review.',
  'auto-telemetry': 'CSV · RPM, AFR, target_AFR, boost_kPa, target_boost_kPa, knock_count. Pressure is gauge kPa. Include matching targets for deviation checks.',
};

function mount(root: HTMLElement) {
  const get = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const input = (id: string) => get<HTMLInputElement>(id);
  const select = (id: string) => get<HTMLSelectElement>(id);
  const put = (id: string, value: string) => { get(id).textContent = value; };
  const params = new URLSearchParams(location.search);
  let brief = readBrief(params);
  let report: Analysis | undefined;
  let sample = false, revision = 0;
  const raw = get<HTMLTextAreaElement>('raw');
  const contact = get<HTMLAnchorElement>('contact');
  const destination = contact.href;
  const options = () => tracks[brief.vertical];
  const list = (id: string, items: string[]) => {
    get(id).replaceChildren(...items.map(value => {
      const li = document.createElement('li');
      li.textContent = value;
      return li;
    }));
  };
  function scenario() {
    const spec = options(), volume = Number(input('volume').value), recovery = Number(input('recovery').value);
    brief.waste = baseline(input('waste').value);
    const savings = Math.round(3 * brief.waste * volume / spec.reference * recovery / 100);
    put('volume-label', 'Monthly ' + spec.unit + ' · ' + volume.toLocaleString('en-US'));
    put('recovery-label', 'Recoverable share · ' + recovery + '%');
    put('savings', money(savings));
    put('formula', '3 months × ' + money(brief.waste) + ' × ' + (volume / spec.reference).toFixed(2) + ' workload × ' + recovery + '%');
    put('assumptions', 'Scenario assumes ' + money(brief.waste) + ' in avoidable monthly cost or risk at ' + spec.reference.toLocaleString('en-US') +
      ' ' + spec.unit + '. The workload slider scales this baseline linearly. Adjust the recovery assumption to match your evidence.');
    const handoff = new URL(destination);
    const context = new URLSearchParams(brief.utms);
    context.set('company', brief.company);
    context.set('vertical', brief.vertical);
    context.set('estimated_savings', String(savings));
    handoff.searchParams.set('text', 'I would like to schedule an engineering review for ' + brief.company +
      '.\n90-day scenario: ' + money(savings) + ' USD.\n' + context.toString());
    contact.href = handoff.href;
  }
  function roadmap() {
    const catalog: Roadmap = options().gaps;
    const found = report?.findings.map(f => f.gap) ?? [];
    const selected = [...new Set([...found, ...brief.gaps])];
    const gaps = selected.length ? selected : Object.keys(catalog);
    const label = (keys: string[]) => keys.map(key => catalog[key][0]).join(', ');
    const basis = [];
    if (found.length) basis.push((sample ? 'Sample indicators: ' : 'Local evidence: ') + label(found) + '.');
    if (brief.gaps.length) basis.push('Outreach hypotheses: ' + label(brief.gaps) + '.');
    put('basis', basis.join(' ') || 'Suggested review sequence. No specific gap has been established.');
    for (let phase = 0; phase < 3; phase++) list('phase-' + phase, gaps.map(g => catalog[g][phase + 1]));
  }
  let auditTicket=0, remix=0;
  const deep=get<HTMLButtonElement>('deep-audit'), again=get<HTMLButtonElement>('audit-remix');
  function audit(){
    if(!report) return;
    const ticket=++auditTicket;
    void ask({action:'teardown_audit',lang:'en',vertical:brief.vertical,entities:[],findings:report.findings.map(f=>f.gap),checks:report.checks,mode:get<HTMLSelectElement>('audit-mode').value,remix},(v:any)=>{
      if(ticket!==auditTicket) return;
      put('audit-result',[v.executive_narrative,...v.remediation_diff,v.roi_justification,anglesText(v)].join('\n\n'));
      again.hidden=false;
    });
  }
  deep.onclick=audit;
  again.onclick=()=>{remix=(remix+1)%1000;audit();};
  function clearReport() {
    revision++;
    report = undefined;
    auditTicket++; remix=0; deep.disabled=true; again.hidden=true; put("audit-result","");
    put('score','Awaiting evidence');
    put('summary','Analyze the current input to score the checks that can be evaluated.');
    list('findings', []);
    get('diff').hidden = true;
    put('diff', '');
    put('status','');
    roadmap();
  }
  function inspect() {
    clearReport();
    try {
      report = analyze(brief.vertical, raw.value, {
        unit:select('pressure-unit').value,
        afr:input('ref-afr').validity.valid ? input('ref-afr').valueAsNumber : NaN,
        boost:input('ref-boost').validity.valid ? input('ref-boost').valueAsNumber : NaN,
      });
      deep.disabled=false;
      const count = report.findings.length;
      put('score', 'Review priority · ' + Math.round(100 * count / report.checks) + '/100');
      put('summary', (sample ? 'Illustrative sample. ' : 'Local input. ') + count + ' of ' + report.checks + ' evaluated checks flagged. ' + report.summary);
      const catalog: Roadmap = options().gaps;
      list('findings', report.findings.map(f => catalog[f.gap][0] + ' — ' + f.evidence));
      put('diff', report.diff ?? '');
      get('diff').hidden = !report.diff;
      put('status','Analysis complete.');
      roadmap();
    } catch (error) {
      put('status', error instanceof Error ? error.message : 'Unable to read this input.');
    }
  }
  function resetTrack() {
    const spec = options();
    select('track').value = brief.vertical;
    put('company', brief.company);
    const catalog: Roadmap = spec.gaps;
    put('focus', spec.title + ' review' + (brief.gaps.length ? ' · ' + brief.gaps.map(g => catalog[g][0]).join(' / ') : ''));
    put('format', formats[brief.vertical]);
    get('trace-settings').hidden = brief.vertical !== 'auto-telemetry';
    select('pressure-unit').value = 'kpa';
    input('ref-afr').value = '';
    input('ref-boost').value = '';
    Object.assign(input('volume'), { min:'0', max:String(spec.reference * 3), step:String(spec.step), value:String(spec.reference) });
    input('recovery').value = String(spec.recovery);
    input('waste').value = String(brief.waste);
    raw.value = '';
    input('file').value = '';
    sample = false;
    clearReport();
    scenario();
  }
  select('track').onchange = () => {
    const next = select('track').value;
    if (!isVertical(next)) return;
    brief = { ...brief, vertical:next, gaps:[] };
    resetTrack();
  };
  for (const id of ['waste','volume','recovery']) input(id).oninput = scenario;
  get('trace-settings').oninput = clearReport;
  get('analyze').onclick = inspect;
  get('sample').onclick = () => { raw.value = options().sample; sample = true; inspect(); };
  raw.oninput = () => { sample = false; clearReport(); };
  async function readFile(files: FileList | null) {
    sample = false;
    raw.value = '';
    clearReport();
    const ticket = revision;
    if (!files || files.length !== 1 || files[0].size > maxBytes) {
      put('status','Choose one text file up to 512 KiB.'); return;
    }
    try {
      const text = await files[0].text();
      if (ticket !== revision) return;
      raw.value = text;
      inspect();
    } catch { if (ticket === revision) put('status','Unable to read this local file.'); }
  }
  input('file').onchange = () => {
    void readFile(input('file').files);
    input('file').value = '';
  };
  get('drop-zone').ondragover = event => event.preventDefault();
  get('drop-zone').ondrop = event => { event.preventDefault(); void readFile(event.dataTransfer?.files ?? null); };
  get('print').onclick = () => window.print();

  const operator = get('operator');
  function opVertical(): Vertical {
    const v = select('op-track').value;
    return isVertical(v) ? v : 'ai-ops';
  }
  function renderGaps(selected: string[]) {
    get('op-gaps').replaceChildren(...Object.entries(tracks[opVertical()].gaps).map(([key, [name]]) => {
      const label = document.createElement('label'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = key; checkbox.checked = selected.includes(key);
      label.append(checkbox, document.createTextNode(name));
      return label;
    }));
  }
  function buildLink() {
    const gaps = Array.from(get('op-gaps').querySelectorAll<HTMLInputElement>('input:checked'), el => el.value);
    const outgoing: Brief = { company:clean(input('op-company').value,80) || defaultCompany, vertical:opVertical(),
      waste:baseline(input('op-waste').value), gaps, utms:brief.utms };
    input('op-link').value = shareLink(outgoing);
    put('op-status','');
  }
  function toggle(open: boolean) {
    operator.hidden = !open;
    get('operator-toggle').setAttribute('aria-expanded', String(open));
    if (open) input('op-company').focus();
  }
  get('operator-toggle').onclick = () => toggle(operator.hidden);
  select('op-track').onchange = () => { renderGaps([]); buildLink(); };
  operator.oninput = buildLink;
  get('op-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(input('op-link').value); put('op-status','Link copied.'); }
    catch { input('op-link').select(); put('op-status','Copy the selected link.'); }
  };
  resetTrack();
  input('op-company').value = brief.company;
  input('op-waste').value = String(brief.waste);
  select('op-track').value = brief.vertical;
  renderGaps(brief.gaps);
  buildLink();
  if (params.get('mode') === 'operator') toggle(true);
}
export default Object.assign(mount, { nativeDiagnostic:true });
