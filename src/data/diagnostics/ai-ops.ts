import type { Diagnostic } from './types';

export default {
  "slug": "ai-ops",
  "title": "Autonomous AI pipelines",
  "name": "AI operations",
  "description": "Route inference across free-tier providers, contain retry costs and replay failed jobs from a durable queue.",
  "command": "route inspect --window 60s",
  "lines": [
    "PROVIDER     QUOTA      STATE",
    "primary      0/60 rpm   429",
    "secondary   17/30 rpm   ready",
    "fallback    queued      retry +32s",
    "tokens      in 2,180    out 410",
    "cost        $0.0000     free tier",
    "pipeline    24 ack      1 deferred"
  ],
  "stages": [
    {
      "when": "Day 1",
      "artifact": "Routing contract",
      "detail": "Inventory model capabilities and quota windows in providers.json. Replay one captured input against each compatible route."
    },
    {
      "when": "Days 2–3",
      "artifact": "Queue and replay fixture",
      "detail": "Persist job IDs before inference. Exercise a simulated 429, honor Retry-After and verify a single downstream write."
    },
    {
      "when": "Day 4",
      "artifact": "Usage ledger",
      "detail": "Export token counts, route selections and unit costs per job. Reconcile one replay batch against provider usage."
    }
  ],
  "questions": [
    {
      "label": "Is quota tracked per provider and model?",
      "gap": "Quota visibility",
      "fix": "Record remaining capacity and reset time per route."
    },
    {
      "label": "Can a job survive a provider timeout?",
      "gap": "Retry budget",
      "fix": "Cap retries and send exhausted jobs to a replay queue."
    },
    {
      "label": "Can you replay a job without duplicating writes?",
      "gap": "Duplicate effects",
      "fix": "Key downstream writes by stable job ID."
    },
    {
      "label": "Can you reconcile token spend per completed job?",
      "gap": "Cost attribution",
      "fix": "Log model, input/output tokens and price version with each job."
    }
  ]
} satisfies Diagnostic;
