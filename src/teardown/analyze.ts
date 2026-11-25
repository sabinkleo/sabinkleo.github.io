import type { Analysis, Finding, Vertical } from './model';

export const maxBytes = 512 * 1024;
const maxRows = 6000;
type Row = Record<string, unknown>;
const key = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const numeric = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && /^[-+]?\d+(?:[.,]\d+)?$/.test(v.trim()))
  ? Number(String(v).replace(',', '.')) : NaN;

function csv(text: string): string[][] {
  const first = text.split('\n', 1)[0];
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';
  const records: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  function finishRow() {
    row.push(field.trim());
    if (row.some(Boolean)) records.push(row);
    if (records.length > maxRows + 1) throw Error('Use a slice of up to 6,000 records.');
    row = []; field = '';
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c === delimiter) {
      if (row.length >= 128) throw Error('Limit the export to 128 columns.');
      row.push(field.trim()); field = '';
    } else if (!quoted && c === '\n') finishRow();
    else field += c;
  }
  if (quoted) throw Error('A CSV field has an unclosed quote.');
  finishRow();
  return records;
}
function rows(text: string): Row[] {
  if (/^[{\[]/.test(text)) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw Error('Invalid JSON. Use an array of usage records or an object with a records array.'); }
    const items = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(items) || !items.length || items.length > maxRows) throw Error('Use 1–6,000 JSON records.');
    return items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Each record must be an object.');
      return Object.fromEntries(Object.entries(item).map(([k,v]) => [key(k), v]));
    });
  }
  const [header, ...data] = csv(text);
  if (!header || !data.length) throw Error('Include a header and at least one data row.');
  const keys = header.map(key);
  if (new Set(keys).size !== keys.length) throw Error('Use distinct column names.');
  return data.map(row => {
    if (row.length !== header.length) throw Error('A row has a different column count from the header.');
    return Object.fromEntries(keys.map((k,i) => [k,row[i]]));
  });
}
function ai(text: string): Analysis {
  const data = rows(text);
  const findings: Finding[] = [], providers = new Set<string>(), seen = new Set<string>();
  let unverifiedRepeats = 0, duplicates = 0, repeatCost = 0, routeCost = 0, fingerprints = 0, providerRows = 0, routingRows = 0;
  for (const row of data) {
    const provider = row.provider;
    if (typeof provider === 'string' && provider.trim()) { providers.add(provider.trim().toLowerCase()); providerRows++; }
    const hash = row.request_hash ?? row.prompt_hash;
    const price = numeric(row.cost_usd);
    const cost = Number.isFinite(price) && price > 0 ? price : 0;
    const hit = String(row.cache_hit).toLowerCase();
    const cacheKnown = ['true','false','0','1'].includes(hit);
    const repeat = typeof hash === 'string' && hash !== '' && seen.has(hash) && ['false','0'].includes(hit);
    if (typeof hash === 'string' && hash !== '') {
      fingerprints++;
      if (!cacheKnown && seen.has(hash)) unverifiedRepeats++;
      seen.add(hash);
    }
    if (repeat) { duplicates++; repeatCost += cost; }
    const eligible = String(row.free_tier_eligible).toLowerCase();
    if (Number.isFinite(price) && ['true','1','false','0'].includes(eligible)) routingRows++;
    if (!repeat && ['true','1'].includes(eligible)) routeCost += cost;
  }
  if (providers.size === 1 && providerRows === data.length) findings.push({gap:'single-key', evidence:'All ' + providerRows + ' supplied records use one provider.'});
  if (duplicates || unverifiedRepeats) findings.push({gap:'no-cache', evidence:duplicates + ' repeated fingerprint(s) recorded a cache miss; ' + unverifiedRepeats +
    ' additional repeat(s) have unknown cache status and are excluded from the savings estimate.'});
  if (routeCost > 0) findings.push({gap:'paid-routing', evidence:'USD ' + routeCost.toFixed(2) + ' in eligible paid calls, excluding duplicate misses. Verify available quota and model compatibility.'});
  const checks = Number(providerRows === data.length) + Number(fingerprints > 0) + Number(routingRows > 0);
  if (!checks) throw Error('Include provider, or request_hash with cache_hit, or cost_usd with free_tier_eligible.');
  return { findings, checks, summary:data.length + ' records. Potential savings within this export: USD ' + (repeatCost + routeCost).toFixed(2) + '. Assumes eligible calls fit the free quota and duplicate misses can be reused.' };
}
function linux(text: string): Analysis {
  const findings: Finding[] = [], diff: string[] = [];
  const global = new Map<string,string>();
  let conditional = false, incomplete = false, ufw = false;
  const exposed = new Set<string>();
  for (const line of text.split('\n')) {
    if (line.length > 8192) throw Error('Use configuration lines of up to 8 KiB.');
    const s = line.replace(/#.*/, '').trim();
    if (/^match\s/i.test(s)) conditional = true;
    if (/^include\s/i.test(s)) incomplete = true;
    const ssh = s.match(/^(PermitRootLogin|PasswordAuthentication)(?:\s*=\s*|\s+)(yes|no|prohibit-password|without-password|forced-commands-only)$/i);
    if (ssh && !conditional && !global.has(ssh[1].toLowerCase())) global.set(ssh[1].toLowerCase(), ssh[2].toLowerCase());
    if (/^Status:\s*active$/i.test(s)) ufw = true;
    const rule = s.match(/^(?:\[\s*\d+\]\s*)?(.+?)\s+ALLOW(?:\s+IN)?\s+(?:Anywhere(?:\s+\(v6\))?|0\.0\.0\.0\/0|::\/0)$/i);
    if (rule) exposed.add(rule[1].replace(/[\u202a-\u202e\u2066-\u2069\u007f-\u009f]/g, '').slice(0,60));
  }
  for (const [directive,gap] of [['PermitRootLogin','root-login'],['PasswordAuthentication','password-auth']]) {
    if (global.get(directive.toLowerCase()) === 'yes') {
      findings.push({gap, evidence:'The first explicit global ' + directive + ' directive is yes.'});
      diff.push('-' + directive + ' yes', '+' + directive + ' no');
    }
  }
  if (ufw && exposed.size) {
    const services = [...exposed].slice(0,10);
    findings.push({gap:'public-ingress', evidence:'Any-source inbound allow: ' + services.join(', ') + '. Confirm these services require public access.'});
    for (const service of services) diff.push('-' + service + ' ALLOW IN Anywhere', '+' + service + ' ALLOW IN <approved source range>');
  }
  const checks = global.size + Number(ufw);
  if (!checks) throw Error('No supported global SSH directives or active UFW status found. Paste the global policy or ufw status output.');
  return { findings, checks, diff:diff.join('\n'), summary:'Checks cover explicit global SSH directives and active UFW output supplied here.' +
    (conditional || incomplete ? ' Includes and Match blocks require separate effective-policy review.' : '') +
    (diff.length ? ' Verify required access before applying policy changes. The diff is a review sketch.' : '') };
}
export interface TraceReference { unit: string; afr: number; boost: number }
const gaugeKpa = (row: Row, name: string, unit: string) => {
  for (const [suffix, scale] of [['_kpa',1],['_psi',6.89476],['_bar',100]] as const) {
    if (row[name + suffix] !== undefined) return numeric(row[name + suffix]) * scale;
  }
  return numeric(row[name]) * (unit === 'psi' ? 6.89476 : unit === 'bar' ? 100 : 1);
};
function telemetry(text: string, ref: TraceReference): Analysis {
  const data = rows(text);
  let lean = 0, knock = 0, peakDelta = 0, peakRpm = 0, afrPairs = 0, knockSamples = 0, boostPairs = 0;
  for (const row of data) {
    const rpm = numeric(row.rpm);
    if (!(rpm > 0)) continue;
    const afr = numeric(row.afr), target = row.target_afr == null || row.target_afr === '' ? ref.afr : numeric(row.target_afr);
    const boost = gaugeKpa(row,'boost',ref.unit);
    const recordedTarget = gaugeKpa(row,'target_boost',ref.unit);
    const expected = Number.isFinite(recordedTarget) ? recordedTarget : ref.boost;
    if (afr > 0 && target > 0 && Number.isFinite(boost)) {
      afrPairs++;
      if (boost > 0 && afr > target + 0.5) lean++;
    }
    const count = numeric(row.knock_count ?? row.knock);
    if (count >= 0) { knockSamples++; if (count > 0) knock++; }
    if (Number.isFinite(boost) && Number.isFinite(expected)) {
      boostPairs++;
      if (boost - expected > peakDelta) { peakDelta = boost - expected; peakRpm = rpm; }
    }
  }
  const findings: Finding[] = [];
  if (lean) findings.push({gap:'lean-boost',evidence:lean + ' boosted samples exceed the supplied AFR target by more than 0.5.'});
  if (knock) findings.push({gap:'knock-events',evidence:knock + ' samples have a positive knock indication. Count is samples, not distinct events.'});
  if (peakDelta > 10) findings.push({gap:'boost-peak',evidence:'Largest positive deviation: ' + peakDelta.toFixed(1) + ' kPa above target at ' + peakRpm + ' RPM.'});
  const checks = Number(afrPairs > 0) + Number(knockSamples > 0) + Number(boostPairs > 0);
  if (!checks) throw Error('Use RPM plus knock_count, or gauge boost_kpa with target_boost_kpa or AFR and target_afr.');
  return {findings,checks,summary:data.length + ' samples. Screening thresholds: positive gauge boost, AFR deviation >0.5 and boost deviation >10 kPa. Target-based checks need matching target channels.'};
}
export function analyze(vertical: Vertical, raw: string, ref: TraceReference): Analysis {
  if (raw.length > maxBytes || new TextEncoder().encode(raw).length > maxBytes) throw Error('Use a file or excerpt up to 512 KiB.');
  const text = raw.trim().replace(/\r\n?/g,'\n');
  if (!text || /[\u0000-\u0008\u000e-\u001f]/.test(text)) throw Error('Paste a plain-text export or load a sample.');
  if (vertical === 'auto-telemetry') return telemetry(text, ref);
  return vertical === 'ai-ops' ? ai(text) : linux(text);
}
