export const tracks = {
  'ai-ops': {
    title: 'Inference operations', unit: 'requests', reference: 100000, step: 1000, recovery: 25,
    gaps: {
      'single-key': ['Single-provider dependency', 'Inventory routes and quotas.', 'Replay a representative batch through a compatible alternate.', 'Compare quality, latency and billed tokens.'],
      'no-cache': ['Repeated inputs', 'Count matching request fingerprints.', 'Test reuse for deterministic, tenant-scoped requests.', 'Measure avoided charges and stale responses.'],
      'paid-routing': ['Paid routing opportunity', 'Identify eligible low-risk requests.', 'Benchmark them against the available free quota.', 'Reconcile actual charges and quota exhaustion.'],
    },
    sample: 'provider,request_hash,cache_hit,cost_usd,free_tier_eligible\ngateway-a,a1,false,0.24,true\ngateway-a,a1,false,0.24,true\ngateway-a,c2,false,0.18,true\ngateway-a,z4,true,0.02,false',
  },
  'linux-security': {
    title: 'Linux access controls', unit: 'servers', reference: 20, step: 1, recovery: 15,
    gaps: {
      'root-login': ['Direct root login', 'Confirm named administrative access.', 'Stage the SSH policy on a test host.', 'Verify recovery access and archive the reviewed policy.'],
      'password-auth': ['Password authentication', 'Inventory key coverage and recovery accounts.', 'Verify key login before enforcing the candidate policy.', 'Review authentication events and exceptions.'],
      'public-ingress': ['Unrestricted ingress', 'Match public listeners to approved services.', 'Review source ranges with each service owner.', 'Recheck the effective inbound rules.'],
    },
    sample: '# Global policy\nPermitRootLogin yes\nPasswordAuthentication yes\nPubkeyAuthentication yes',
  },
  'auto-telemetry': {
    title: 'Dyno telemetry', unit: 'dyno hours', reference: 40, step: 1, recovery: 20,
    gaps: {
      'lean-boost': ['AFR above target under boost', 'Verify fuel scale and wideband calibration.', 'Align measured and target AFR with gauge pressure.', 'Review flagged cells with the dyno operator.'],
      'knock-events': ['Knock indications', 'Document whether the channel reports counts or retard.', 'Correlate indicated samples with RPM and ignition.', 'Review sensor validity with the calibrator.'],
      'boost-peak': ['Peak boost above target', 'Verify pressure units and sensor reference.', 'Overlay measured and target pressure.', 'Document the peak deviation and review conditions.'],
    },
    sample: 'rpm,afr,target_afr,boost_kpa,target_boost_kpa,knock_count,timing_deg\n2800,12.4,12.4,20,22,0,16\n4200,13.8,12.3,65,52,1,13\n5100,12.4,12.3,51,52,0,14',
  },
} as const;

export type Vertical = keyof typeof tracks;
export interface Brief { company: string; vertical: Vertical; waste: number; gaps: string[]; utms: URLSearchParams }
export const defaultCompany = 'Your Engineering Team';
export const maxWaste = 1_000_000;
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export const isVertical = (s: string): s is Vertical => Object.hasOwn(tracks, s);
export const clean = (s: string, limit: number) => s.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N} .,'’&()_+%:@/-]/gu, '').trim().slice(0, limit);
export function baseline(s: string) {
  return /^\d{1,10}(?:\.\d{1,2})?$/.test(s) ? Math.min(maxWaste, Number(s)) : 0;
}
export function readBrief(p: URLSearchParams): Brief {
  const v = p.get('v') ?? '';
  const vertical = isVertical(v) ? v : 'ai-ops';
  const utms = new URLSearchParams();
  for (const [key, raw] of p) {
    if (!/^utm_[a-z0-9_]{1,24}$/.test(key) || utms.size >= 12) continue;
    const value = clean(raw.slice(0, 256), 100);
    if (value) utms.set(key, value);
  }
  const gaps = (p.get('g') ?? '').slice(0, 256).split(',').map(s => s.trim())
    .filter(s => Object.hasOwn(tracks[vertical].gaps, s));
  return { company: clean((p.get('c') ?? '').slice(0, 256), 80) || defaultCompany, vertical,
    waste: baseline(p.get('waste') ?? ''), gaps: [...new Set(gaps)], utms };
}
export function shareLink(brief: Brief) {
  const url = new URL('/en/teardown/', location.origin);
  url.search = brief.utms.toString();
  url.searchParams.set('c', brief.company);
  url.searchParams.set('v', brief.vertical);
  url.searchParams.set('waste', String(brief.waste));
  if (brief.gaps.length) url.searchParams.set('g', brief.gaps.join(','));
  return url.href;
}
export interface Finding { gap: string; evidence: string }
export interface Analysis { findings: Finding[]; checks: number; summary: string; diff?: string }
export type Roadmap = Readonly<Record<string, readonly string[]>>;
