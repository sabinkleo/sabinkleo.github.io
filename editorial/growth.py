"""Private, aggregate monthly editorial reporting. All amounts are integer BRL cents."""

import argparse
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import json
from pathlib import Path
import re

from .distribution import CHANNELS


DIMENSIONS = ("month", "campaign", "channel")
MEASURES = (
    "qualified_visits", "engaged_reads", "tool_clicks", "diagnostics_completed",
    "qualified_conversations", "proposals", "signed_contracts", "paid_contracts",
    "cash_received_cents", "refunds_cents", "direct_costs_cents",
    "allocated_expenses_and_taxes_cents", "work_minutes",
)
MONEY = ("cash_received_cents", "refunds_cents", "direct_costs_cents")
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def normalize(row):
    if not isinstance(row, dict) or set(row) != set(DIMENSIONS + MEASURES):
        raise ValueError("Each row must contain exactly the dimensions and metrics in the template")
    if not isinstance(row["campaign"], str) or not SLUG.fullmatch(row["campaign"]) or len(row["campaign"]) > 100:
        raise ValueError("Campaign must be an editorial slug or unattributed")
    if not isinstance(row["channel"], str) or row["channel"] not in {*CHANNELS, "unattributed"}:
        raise ValueError("Unknown channel")
    if not isinstance(row["month"], str) or not re.fullmatch(r"\d{4}-\d{2}", row["month"]):
        raise ValueError("Month must use YYYY-MM")
    date.fromisoformat(row["month"] + "-01")
    for key in MEASURES:
        value = row[key]
        if value is not None and (type(value) is not int or value < 0):
            raise ValueError(f"{key} must be a nonnegative integer or null")
    signed, paid = row["signed_contracts"], row["paid_contracts"]
    if signed is not None and paid is not None and paid > signed:
        raise ValueError("Paid contracts cannot exceed signed contracts in the same cohort")
    if paid == 0 and (row["cash_received_cents"] or 0) > 0:
        raise ValueError("A received payment requires a paid contract in this cohort")
    return row


def divide(numerator, denominator):
    if numerator is None or not denominator:
        return None
    return str((Decimal(numerator) / Decimal(denominator)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def outcome(row):
    contribution = None
    if all(row[key] is not None for key in MONEY):
        contribution = row["cash_received_cents"] - row["refunds_cents"] - row["direct_costs_cents"]
    allocated = row["allocated_expenses_and_taxes_cents"]
    net = contribution - allocated if contribution is not None and allocated is not None else None
    minutes = row["work_minutes"]
    cents_to_hourly_reais = Decimal(60) / Decimal(100)
    return {
        "cash_contribution_cents": contribution, "net_cents": net,
        "contribution_brl_per_hour": divide(contribution * cents_to_hourly_reais if contribution is not None else None, minutes),
        "net_brl_per_hour": divide(net * cents_to_hourly_reais if net is not None else None, minutes),
        "net_roi_percent_on_cash_spend": divide(net * 100 if net is not None else None,
                                                row["direct_costs_cents"] + allocated if net is not None else None),
    }


def next_experiment(row):
    """Suggest one test from recorded counts. Thresholds are triage rules."""
    if (row["tool_clicks"] or 0) >= 20 and row["diagnostics_completed"] == 0:
        return "Comparar uma chamada para uma etapa específica do diagnóstico com a chamada atual. Medir conclusões por clique em uma nova coorte."
    if (row["qualified_conversations"] or 0) >= 5 and row["proposals"] == 0:
        return "Revisar os critérios de qualificação e testar um convite para demonstração com o mesmo público."
    if (row["proposals"] or 0) >= 3 and row["paid_contracts"] == 0:
        return "Revisar as objeções registradas em privado antes de aumentar a frequência do tema."
    if (row["paid_contracts"] or 0) > 0:
        return "Conferir a origem e o lucro por hora. Repetir o tema em outra coorte para testar se o resultado se sustenta."
    return None


def report(rows):
    if not isinstance(rows, list) or not rows:
        raise ValueError("Provide at least one aggregate cohort")
    validated = [normalize(row) for row in rows]
    keys = {tuple(row[key] for key in DIMENSIONS) for row in validated}
    if len(keys) != len(rows):
        raise ValueError("Duplicate month, campaign and channel; replace the prior aggregate")
    totals = {
        key: sum(row[key] for row in validated) if all(row[key] is not None for row in validated) else None
        for key in MEASURES
    }
    return {
        "cohorts": [dict(row, **outcome(row), next_experiment=next_experiment(row)) for row in validated],
        "totals": dict(totals, **outcome(totals)),
    }


def template():
    return [{**dict.fromkeys(MEASURES), "month": date.today().strftime("%Y-%m"),
             "campaign": "unattributed", "channel": "unattributed"}]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for cmd in ("template", "report"):
        sub.add_parser(cmd).add_argument("file", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "template":
            with args.file.open("x", encoding="utf-8") as handle:
                json.dump(template(), handle, ensure_ascii=False, indent=2)
                handle.write("\n")
        else:
            data = json.loads(args.file.read_text(encoding="utf-8-sig"))
            print(json.dumps(report(data), ensure_ascii=False, indent=2))
    except (OSError, UnicodeError, ValueError) as exc:
        parser.exit(2, f"{exc}\n")


if __name__ == "__main__":
    main()
