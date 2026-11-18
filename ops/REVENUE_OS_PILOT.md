# VERTICE LABS / REVENUE OS — PILOT SOP
Status: validation, not an established recurring-revenue product. Updated: 2026-11-18.

## Positioning
An implementation service for local businesses and small agencies selling via ads + WhatsApp. Not a replacement for Hubdash/Kommo/RD Station and not an automatic attribution engine. Sell source hygiene, recorded stages, follow-ups, and a weekly actionable report.

## Existing top-of-funnel asset
- Public free diagnostic: https://verticelabs.me/raio-x-vendas/
- WhatsApp link uses the sales destination already configured in `tuning/index.html`.
- Current module runs locally in the browser; it neither saves personal information nor reports actual conversions.
- UTMs on the diagnostic page are only copied to the voluntary WhatsApp summary. They are not verified ad attribution.

## Initial productized offer (hypothesis — test before scaling)
- Setup: R$1,497; 50% on signing, 50% after acceptance.
- Optional operational maintenance: R$197/month, limited to 1 hour/month of monitoring/reporting; additional work quoted.
- Setup scope: one business, one sales process, up to five tagged campaign landing URLs, one simple existing CRM or Sheets-based opportunity tracker, three approved follow-up templates, one 30-minute handover, one example weekly report.
- Excluded: multi-channel API integrations, automatic Meta/WhatsApp Cloud API events, ad spend, ad creation, custom software, CRM licenses, sales guarantees, and bulk outbound messaging.
- Do not claim an ad generated a sale until its originating tag and resulting transaction are matched using recorded evidence.

## Qualification (only pitch if buying power and problem exist)
- Paid ads or an owned traffic channel with at least ~50 inquiries/month, OR high-ticket service with identifiable inbound opportunities.
- Operator willing to record response and deal outcome.
- Gross contribution per sale high enough to support onboarding economics.
- Evidence of actual leakage; never imply the simulator is audited revenue.
- Existing CRM usable? Reuse it. If not, start with Sheets and manual capture.

## Operating sequence (10 business days)
1. Discovery: 50 targeted B2B accounts in Curitiba, prioritized by visible ads/website/WhatsApp funnel (publicly evidenced, no scraping behind login).
2. Contact: up to 10 genuinely personalized messages/day, manually approved, respecting opt-outs and channel terms.
3. Demo: show free calculator, then ask for last 30 days of aggregate figures (NOT customer names, phone numbers or chats).
4. Paid pilot: collect 50% deposit and agreed data-handling scope.
5. Configure tracking links and manual lead source token, define stages and an owner. Document known unknowns.
6. Acceptance test: synthetic lead with a source tag enters the tracker; stage moves to Won; report reflects only recorded deals.
7. Follow-up: weekly report and a small list of remedial actions.

## Measurement / stop rules (targets, NOT forecasts)
- Reach 50 relevant businesses, 8 relevant replies, 3 demos and 1 paid pilot within 10 business days.
- If fewer than 5 replies: change targeting or message before adding features.
- If demos happen but nobody buys: review proof, urgency, setup price, and required data entry; don't immediately build a SaaS.
- Track realized contribution/hour = (collected revenue - direct expenses - refunds) / all hours spent, including prospecting, setup, support and revisions.
- Keep ad spend at R$0 until one client pays and retention is observable.

## Roles
- Prospecting operator: select targets, note the specific sales gap and secure permission for a demo.
- Sales operator: qualify, quote scope, collect deposit and handle client expectations.
- Delivery operator: configure links, funnel tracking and report; run synthetic tests.
- Recorder/QA: maintain experiment counts, handoff checklist and exceptions.
People can hold several roles; assign names only when the team agrees.

## Security and compliance
- This is a public GitHub repository. NEVER commit real leads, messages, client spreadsheets, contact lists, access tokens or passwords.
- For personal data, establish purpose, access and retention policy consistent with Brazil's LGPD. Keep pilot analysis aggregate whenever possible.
- Avoid browser automation intended to bypass WhatsApp/Meta restrictions. No unauthorized access to ad accounts.
- Do not identify a WhatsApp click as a sale. Follow-ups require permission and a human accountable owner.

## Market references (review when conditions change)
- Hubdash Starter: R$297/month + R$999 setup as listed November 2026: https://hubdash.com.br/planos/
- Kommo partner is free to join and reports 35–50% on qualified partner sales; commission flows through partner portal, not a simple affiliate link: https://www.kommo.com/br/parceiros/torne-se-parceiro/
- Bruning partner requires CNPJ in technology, a sales/implementation/support team and systems experience: https://bruningsistemas.com.br/seja-um-parceiro-bruning/
- Sebrae 2026 reports WhatsApp used by 82% of surveyed small businesses: https://agenciasebrae.com.br/dados/whatsapp-se-consolida-nas-vendas-on-line-enquanto-facebook-e-lojas-proprias-perdem-folego/
