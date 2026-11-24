"""Convert the private commercial archive into the CRM's JSON import format."""
import argparse
import json
import os
import re
from io import BytesIO
from zipfile import ZipFile


def phone(value):
    digits = re.sub(r"\D", "", value or "")
    if len(digits) in (10, 11):
        digits = "55" + digits
    return digits if re.fullmatch(r"55[1-9]\d{9,10}", digits) else ""


def convert(archive, queue_archive=None):
    with ZipFile(archive) as source:
        identities = json.loads(source.read("identity-map-93.json"))
        reviews = json.loads(source.read("crm-reviewed-20.json"))
        with ZipFile(BytesIO(source.read("original/KLEIN_LEADS_MEGA_PACK.zip"))) as original:
            historical = json.loads(original.read("KLEIN_LEADS_MASTER.json"))
    queue = {}
    if queue_archive:
        with ZipFile(queue_archive) as source:
            queue = {r["lead_id"]: r for r in json.loads(source.read("sales-queue-reviewed-2026-11-24.json"))}
    by_id = {r["source_id"]: r for r in identities}
    by_review = {r["source_id"]: r for r in reviews}
    if len(by_id) != len(identities) or len(by_review) != len(reviews):
        raise ValueError("Repeated source ID")
    if {r["ID origem"] for r in historical} != set(by_id) or len(historical) != len(by_id):
        raise ValueError("Historical rows and identity map disagree")
    if any(s not in by_id or r["lead_id"] != by_id[s]["lead_id"] for s, r in by_review.items()):
        raise ValueError("Reviewed IDs do not match the identity map")

    results = []
    for original in historical:
        source_id = original["ID origem"]
        identity = by_id[source_id]
        if identity["duplicate_of"]:
            continue
        reviewed = by_review.get(source_id, {})
        confirmed = reviewed.get("verification_status") == "contact_source_verified"
        number = phone(reviewed.get("business_phone") if confirmed else original.get("Telefone informado"))
        whatsapp = phone(original.get("Link WhatsApp histórico"))
        evidence = []
        if reviewed.get("source_url"):
            evidence.append({
                "text": "Contato com fonte verificada" if confirmed else "Fonte consultada · contato pendente de confirmação",
                "url": reviewed["source_url"], "date": reviewed.get("verified_at"),
            })
        if reviewed.get("observed_issue") and reviewed.get("additional_evidence_url"):
            evidence.append({"text": reviewed["observed_issue"], "url": reviewed["additional_evidence_url"],
                             "date": reviewed.get("verified_at")})
        for label, field in (("Site histórico", "Site informado"), ("Maps histórico", "Maps informado")):
            if original.get(field):
                evidence.append({"text": label + " · verificar", "url": original[field]})
        hypotheses = []
        if reviewed.get("commercial_hypothesis"):
            hypotheses.append({"text": reviewed["commercial_hypothesis"], "provider": "Revisão comercial"})
        draft = queue.get(identity["lead_id"], {})
        if draft.get("commercial_opportunity") and draft.get("draft_source"):
            hypotheses.append({"text": draft["commercial_opportunity"], "provider": draft["draft_source"]})
        lead = {
            "id": identity["lead_id"], "sourceId": source_id, "name": original["Empresa / clínica"],
            "segment": original.get("Segmento") or "", "city": original.get("Região / bairro") or "",
            "phone": number, "whatsapp": whatsapp if (not confirmed or number == whatsapp) else "",
            "confirmed": confirmed, "reviewed": bool(reviewed), "evidence": evidence, "hypotheses": hypotheses,
            "decisionGroup": identity.get("decision_group"), "decisionGroupStatus": identity.get("decision_group_status"),
        }
        results.append({"lead": lead, "state": {"nextAction": reviewed.get("next_action") or original.get("Próxima ação") or ""}})
    if len({row["lead"]["id"] for row in results}) != len(results):
        raise ValueError("Repeated lead ID; reconcile the identity map first")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("output")
    parser.add_argument("--sales-queue")
    args = parser.parse_args()
    rows = convert(args.archive, args.sales_queue)
    with os.fdopen(os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as out:
        json.dump(rows, out, ensure_ascii=False, indent=2)
    print(f"{len(rows)} unique leads, {sum(row['lead']['reviewed'] for row in rows)} reviewed, "
          f"{sum(row['lead']['confirmed'] for row in rows)} confirmed contacts")
