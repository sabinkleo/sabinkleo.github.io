import type { Diagnostic } from './types';

export default {
  "slug": "linux-security",
  "title": "Linux hardening & SecOps",
  "name": "Linux security",
  "description": "Audit administrative access, firewall policy and recovery evidence on self-hosted Linux infrastructure.",
  "command": "baseline review --host edge-02",
  "lines": [
    "SSH         keys only       PASS",
    "fail2ban    sshd jail       PASS",
    "ufw/nft     ingress deny    PASS",
    "auditd      rules loaded    PASS",
    "forwarder   last ack 2d     FAIL",
    "restore     evidence due    REVIEW"
  ],
  "stages": [
    {
      "when": "Day 1",
      "artifact": "Host baseline",
      "detail": "Record approved SSH access, active listeners and effective firewall rules in a dated inventory."
    },
    {
      "when": "Days 2–3",
      "artifact": "Reviewed policy diff",
      "detail": "Stage access and audit-policy changes on one host. Verify console recovery before promoting the reviewed diff."
    },
    {
      "when": "Day 4",
      "artifact": "Recovery evidence",
      "detail": "Restore a disposable host from backup and attach timestamps, audit delivery receipts and owner sign-off."
    }
  ],
  "questions": [
    {
      "label": "Can operators verify key-only administrative access?",
      "gap": "Access baseline",
      "fix": "Review effective SSH settings and document recovery-console access."
    },
    {
      "label": "Does the effective firewall match the approved listener list?",
      "gap": "Firewall drift",
      "fix": "Compare active listeners with the approved ingress inventory."
    },
    {
      "label": "Are audit events received off-host?",
      "gap": "Audit delivery",
      "fix": "Verify a test event reaches the collector and alert on delivery gaps."
    },
    {
      "label": "Has a backup restore been timed and reviewed?",
      "gap": "Recovery evidence",
      "fix": "Restore an isolated host and record recovery time with its owner."
    }
  ]
} satisfies Diagnostic;
