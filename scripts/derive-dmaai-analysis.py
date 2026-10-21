#!/usr/bin/env python3
"""
derive-dmaai-analysis.py — derive `dmaai-analysis-latest.json` directly
from the dev-DB integrity report 0 snapshot (`v-integrity-jde-aais.json`).

Replaces the xlsx-extractor path when the analyzer hasn't been run.
The analyzer's pattern detection (nz, glsub, mc, unrec) is ported here
so the demo JSON aligns with whatever F4095 data is in RapidReconciler_Dev.

Why this exists: the original workbook in the owner's Downloads was
generated against an unrelated F4095 dump (companies 00001-00011). The
V8 demo elsewhere (Reconciliation, Transactions) is scoped to the JWT's
companies (00010 + 00050 in `data/demo-jwt-payload.json`), so the
analysis worklist needs to reflect *that* data set. This script reads
the same snapshot V8's Transactions page preloads
(`POST /inventory/integrity` with `report: v_integrity_jde_aais`) and
emits the worklist + module grids in the shape V8 expects.

Usage:
    python3 derive-dmaai-analysis.py \
        --src  RRV8/data/v-integrity-jde-aais.json \
        --out  RRV8/data/dmaai-analysis-latest.json \
        --cos  00010,00050           # restrict to these JDE companies

Idempotent — re-running produces the same JSON for the same input.
"""

from __future__ import annotations

import argparse
import collections
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


# Module → AAI tables (mirrors RRV8/scripts/extract-dmaai-analysis.py +
# the JS-side MODULE_AAI on the page).
MODULE_AAI = {
    "Sales":         {"4220", "4226", "4228", "4230", "4240", "4245", "4250",
                      "4270"},
    "Inventory":     {"4122", "4124", "4134", "4136", "4140", "4141", "4152",
                      "4154", "4162", "4164", "4172", "4174"},
    "Manufacturing": {"3110", "3120", "3130", "3210", "3220", "3240", "3260",
                      "3270", "3280", "3400", "3401"},
    "Purchasing":    {"4126", "4128", "4310", "4315", "4318", "4320", "4330",
                      "4332", "4335", "4337", "4340", "4350", "4355", "4365",
                      "4370", "4375", "4385", "4390", "4400", "4405"},
}
MODULE_ORDER = ["Sales", "Inventory", "Manufacturing", "Purchasing"]

# nz pairs are (Dr, Cr) — debit side first, credit side second. These
# come straight from the analyzer guide §6 "Net Zero Review".
NZ_PAIRS = [
    ("4240", "4220"),   # Sales — COGS Dr, Inventory Cr
    ("4122", "4124"),   # Inventory — debit / credit pair
    ("4126", "4128"),   # Purchasing — RNV debit / credit
    ("4134", "4136"),   # Inventory — in-transit debit / credit
]

# DocTypes that legitimately net to zero by design — skip them from
# the nz finding. IT (Inventory Transfer) wash entries between branches
# are the canonical case: Dr and Cr ARE supposed to be the same account
# because the transaction is a same-account move from one branch unit
# to another. Add other exempt doc types here as finance confirms.
NZ_EXEMPT_DOCTYPES = {"IT"}

# Which module each pair belongs to. The "fix" + "ask" findings for a
# pair are reported as that module's responsibility.
PAIR_MODULE = {
    ("4240", "4220"): "Sales",
    ("4122", "4124"): "Inventory",
    ("4126", "4128"): "Purchasing",
    ("4134", "4136"): "Inventory",
}

# Standard JDE distribution AAI range. Anything outside this is "unrec".
STD_AAI_LO = 3000
STD_AAI_HI = 4499

DEFAULT_CAVEAT = (
    "This audit checks your DMAAI setup against known configuration issues. "
    "It's a starting point, not a complete review. "
    "Important: what you see here is the current DMAAI setup. For "
    "transactions that have already posted, the configuration may have been "
    "different at the time — posted journal entries reflect the DMAAI active "
    "on their post date, not necessarily what's set up now, so your findings "
    "may not line up with historical journal entries. "
    "Always test DMAAI changes in a non-production environment before "
    "applying them in JDE."
)

DEFAULT_IGNORE_BLURB = (
    "Some AAI / GL class / company combinations aren't configured. We don't "
    "flag those — if a missing setup ever matters, JDE will throw a posting "
    "error when a transaction hits it and you'll see the problem "
    "immediately. Better to fix posting errors as they come up than chase "
    "every hypothetical gap."
)


def _key_lookup(r: dict) -> tuple[str, str, str]:
    """Pair-matching key. OrderType + DocType + GLClass uniquely identify
    the AAI lookup path; rows that share this triple AND the same full
    account (BU/Object/Sub) net to zero."""
    return (
        r["OrderType"].strip(),
        r["DocType"].strip(),
        r["GLClass"].strip(),
    )


def _acct(r: dict) -> tuple[str, str, str]:
    return (
        r["BusUnit"].strip(),
        r["Object"].strip(),
        r["Sub"].strip(),
    )


def _module_for_aai(aai: str) -> str | None:
    for m, tables in MODULE_AAI.items():
        if aai in tables:
            return m
    return None


def _normalize_row(r: dict) -> dict:
    """Source-shape → V8-shape, key-renaming included."""
    return {
        "aaiNumber":    str(r["TableNumber"]).strip(),
        "companyNumber": r["CompanyNumber"].strip() if isinstance(r["CompanyNumber"], str) else str(r["CompanyNumber"]),
        "orderType":    r["OrderType"].strip(),
        "docType":      r["DocType"].strip(),
        "glClass":      r["GLClass"].strip(),
        "costType":     r.get("CostType", "").strip(),
        "businessUnit": r["BusUnit"].strip(),
        "objAccount":   r["Object"].strip(),
        "subsidiary":   r["Sub"].strip(),
        "analyzerNote": "",
    }


def detect_findings(rows: list[dict]) -> tuple[list, list]:
    """Run the analyzer's pattern detection over `rows`. Returns
    (fixFirst, askCustomer) lists of finding dicts in the JSON-sidecar
    shape (id, issueType, company, scope, glClass, module, task, docTypes,
    glClasses, reference)."""
    by_co = collections.defaultdict(list)
    for r in rows:
        by_co[r["CompanyNumber"]].append(r)

    fix_first: list[dict] = []
    ask_customer: list[dict] = []

    # ---- nz: net-zero pairs (FIX FIRST) ----
    for co in sorted(by_co):
        for a, b in NZ_PAIRS:
            # Skip DocTypes whose net-zero behavior is by design
            # (e.g. IT — Inventory Transfer wash entries).
            ra = [r for r in by_co[co] if str(r["TableNumber"]) == a
                  and r["DocType"].strip() not in NZ_EXEMPT_DOCTYPES]
            rb = [r for r in by_co[co] if str(r["TableNumber"]) == b
                  and r["DocType"].strip() not in NZ_EXEMPT_DOCTYPES]
            ka = {(_key_lookup(r), _acct(r)) for r in ra}
            kb = {(_key_lookup(r), _acct(r)) for r in rb}
            shared = ka & kb
            if not shared:
                continue
            n = len(shared)
            # Capture which DocTypes + GLClasses participated.
            doc_types = sorted({k[0][1] or "(blank)" for k in shared})
            gl_classes = sorted({k[0][2] or "(blank)" for k in shared})
            module = PAIR_MODULE.get((a, b))
            fix_first.append({
                "issueType": "nz",
                "company":   co,
                "scope":     f"{a}-{b}",
                "glClass":   None,
                "module":    module,
                "task": (
                    f"AAIs {a} (Dr) and {b} (Cr) both route to the same account on "
                    f"{n} configuration{'s' if n != 1 else ''}. Postings will net to "
                    f"zero. Likely a copy-paste error — correct the side that's wrong."
                ),
                "docTypes":  ", ".join(doc_types),
                "glClasses": ", ".join(gl_classes),
                "reference": f"{module} tab → find AAIs {a}/{b}",
            })

    # ---- itnz: IT pairs that fail to net to zero (FIX FIRST) ----
    # IT (Inventory Transfer) is supposed to wash — Dr and Cr should
    # land on the same full account. If they don't, the transfer leaves
    # a balance and that's a real setup error. The inverse of the
    # standard nz check: same key, *different* accounts.
    for co in sorted(by_co):
        for a, b in NZ_PAIRS:
            ra_it = [r for r in by_co[co]
                     if str(r["TableNumber"]) == a and r["DocType"].strip() == "IT"]
            rb_it = [r for r in by_co[co]
                     if str(r["TableNumber"]) == b and r["DocType"].strip() == "IT"]
            a_by = {_key_lookup(r): r for r in ra_it}
            b_by = {_key_lookup(r): r for r in rb_it}
            shared = a_by.keys() & b_by.keys()
            misaligned = [k for k in shared if _acct(a_by[k]) != _acct(b_by[k])]
            if not misaligned:
                continue
            gl_classes = sorted({k[2] or "(blank)" for k in misaligned})
            module = PAIR_MODULE.get((a, b))
            fix_first.append({
                "issueType": "itnz",
                "company":   co,
                "scope":     f"{a}-{b}",
                "glClass":   None,
                "module":    module,
                "task": (
                    f"Inventory Transfer (DocType IT) on AAI pair {a}/{b}: "
                    f"{len(misaligned)} configuration{'s' if len(misaligned) != 1 else ''} "
                    "route the Dr and Cr to different accounts. IT is supposed to wash to "
                    "zero between branches — these won't. Likely a setup error on one of "
                    "the two sides."
                ),
                "docTypes":  "IT",
                "glClasses": ", ".join(gl_classes),
                "reference": f"{module} tab → find AAI pair {a}/{b} on DocType IT",
            })

    # ---- mc: missing complement (ASK CUSTOMER) ----
    for co in sorted(by_co):
        for a, b in NZ_PAIRS:
            ra = [r for r in by_co[co] if str(r["TableNumber"]) == a]
            rb = [r for r in by_co[co] if str(r["TableNumber"]) == b]
            ka = {_key_lookup(r) for r in ra}
            kb = {_key_lookup(r) for r in rb}
            module = PAIR_MODULE.get((a, b))
            # `a` exists, `b` doesn't
            only_a = ka - kb
            if only_a:
                doc_types = sorted({k[1] or "(blank)" for k in only_a})
                gl_classes = sorted({k[2] or "(blank)" for k in only_a})
                ask_customer.append({
                    "issueType": "mc",
                    "company":   co,
                    "scope":     f"{a}-{b}",
                    "glClass":   a,                       # focus AAI (overloaded slot)
                    "module":    module,
                    "task": (
                        f"AAI pair {a}/{b}: AAI {a} is configured on "
                        f"{len(only_a)} key{'s' if len(only_a) != 1 else ''} where AAI {b} is not. "
                        "Customer call: are these legitimate one-sided entries, or should "
                        f"AAI {b} be added so the postings balance?"
                    ),
                    "docTypes":  ", ".join(doc_types),
                    "glClasses": ", ".join(gl_classes),
                    "reference": f"{module} tab → find AAI pair {a}/{b}",
                })
            only_b = kb - ka
            if only_b:
                doc_types = sorted({k[1] or "(blank)" for k in only_b})
                gl_classes = sorted({k[2] or "(blank)" for k in only_b})
                ask_customer.append({
                    "issueType": "mc",
                    "company":   co,
                    "scope":     f"{a}-{b}",
                    "glClass":   b,
                    "module":    module,
                    "task": (
                        f"AAI pair {a}/{b}: AAI {b} is configured on "
                        f"{len(only_b)} key{'s' if len(only_b) != 1 else ''} where AAI {a} is not. "
                        "Customer call: are these legitimate one-sided entries, or should "
                        f"AAI {a} be added so the postings balance?"
                    ),
                    "docTypes":  ", ".join(doc_types),
                    "glClasses": ", ".join(gl_classes),
                    "reference": f"{module} tab → find AAI pair {a}/{b}",
                })

    # ---- glsub: subsidiary divergence (ASK CUSTOMER) ----
    # For each (co, AAI, GLClass) group, if multiple distinct subsidiaries
    # appear AND a dominant one covers >50% but <100% of rows, that's the
    # "is the exception intentional?" question.
    by_co_aai_gl = collections.defaultdict(list)
    for r in rows:
        by_co_aai_gl[
            (r["CompanyNumber"], str(r["TableNumber"]), r["GLClass"].strip())
        ].append(r["Sub"].strip())
    for (co, aai, gl), subs in sorted(by_co_aai_gl.items()):
        if len(subs) < 2:
            continue
        sub_counter = collections.Counter(subs)
        if len(sub_counter) < 2:
            continue
        top_sub, top_count = sub_counter.most_common(1)[0]
        total = sum(sub_counter.values())
        if top_count == total:
            continue  # all the same — no divergence
        if top_count / total <= 0.5:
            continue  # no dominant pattern — not a "drift" finding
        minority = total - top_count
        minor_list = [s for s in sub_counter if s != top_sub]
        minor_label = ", ".join(
            f"'{s if s else '(blank)'}' on {sub_counter[s]} row{'s' if sub_counter[s] != 1 else ''}"
            for s in minor_list[:3]
        )
        if len(minor_list) > 3:
            minor_label += f", … + {len(minor_list) - 3} more"
        module = _module_for_aai(aai)
        # Limit the per-(co,aai,gl) grouping to AAIs that have a real module
        # home — orphan AAIs (3401 only-rows etc.) still surface as glsub
        # but with module=null.
        ask_customer.append({
            "issueType": "glsub",
            "company":   co,
            "scope":     aai,
            "glClass":   gl,
            "module":    module,
            "task": (
                f"AAI {aai} · GL class {gl}: subsidiary "
                f"'{top_sub if top_sub else '(blank)'}' is used on "
                f"{top_count} of {total} F4095 rows (the dominant pattern), "
                f"but {minority} row{'s' if minority != 1 else ''} use{'' if minority != 1 else 's'} "
                f"a different subsidiary ({minor_label}). Customer call: was the "
                f"exception intentional, or is it drift that should be aligned to "
                f"'{top_sub if top_sub else '(blank)'}'?"
            ),
            "docTypes":  "",
            "glClasses": gl,
            "reference": f"JDE Data tab → filter Co={co}, AAI={aai}, GL={gl}",
        })

    # ---- unrec: AAIs outside the standard JDE distribution range ----
    unrec_aais = collections.Counter()
    for r in rows:
        t = int(r["TableNumber"])
        if t < STD_AAI_LO or t > STD_AAI_HI:
            unrec_aais[str(r["TableNumber"])] += 1
    if unrec_aais:
        # One finding per "series" (e.g. 4900 covers 4920, 4921).
        by_series = collections.defaultdict(list)
        for aai, n in unrec_aais.items():
            series = aai[:2] + "00"
            by_series[series].append((aai, n))
        for series, members in sorted(by_series.items()):
            total = sum(n for _, n in members)
            ask_customer.append({
                "issueType": "unrec",
                "company":   None,
                "scope":     series,
                "glClass":   None,
                "module":    None,
                "task": (
                    f"AAI series {series} (AAIs " +
                    ", ".join(a for a, _ in members) +
                    ") is outside the JDE standard 3000–4499 distribution range. "
                    f"{total} F4095 row{'s' if total != 1 else ''} use this series. "
                    "Customer call: custom AAIs added by your team, or misconfigurations "
                    "with the wrong AAI number?"
                ),
                "docTypes":  "",
                "glClasses": "",
                "reference": f"JDE Data tab → autofilter AAI Number to " +
                             " / ".join(a for a, _ in members),
            })

    # Stable ordering before ID assignment:
    #   FIX FIRST: by (issueType, company, scope, glClass)
    #   ASK CUSTOMER: cross-company findings (issueType=unrec, company=None)
    #     sink to the end; otherwise same sort
    def fix_sort_key(f):
        return (f["issueType"], f["company"] or "", f["scope"] or "", f["glClass"] or "")
    def ask_sort_key(f):
        return (
            1 if f["issueType"] == "unrec" else 0,
            f["issueType"], f["company"] or "", f["scope"] or "", f["glClass"] or ""
        )
    fix_first.sort(key=fix_sort_key)
    ask_customer.sort(key=ask_sort_key)

    # Assign sequential IDs.
    for i, f in enumerate(fix_first, start=1):
        f["id"] = f"F{i}"
    for i, f in enumerate(ask_customer, start=1):
        f["id"] = f"Q{i}"

    return fix_first, ask_customer


def build_module_buckets(rows: list[dict]) -> tuple[dict, list]:
    """Bucket each F4095 row into a module by its AAI. Rows whose AAI
    has no module map land in `unmappedAais` (reported in _meta)."""
    modules: dict[str, list] = {m: [] for m in MODULE_ORDER}
    unmapped_counts: collections.Counter = collections.Counter()
    for r in rows:
        nr = _normalize_row(r)
        target = _module_for_aai(nr["aaiNumber"])
        if target is None:
            unmapped_counts[nr["aaiNumber"]] += 1
            continue
        modules[target].append(nr)
    unmapped = [
        {"aaiNumber": k, "rowCount": v}
        for k, v in sorted(unmapped_counts.items())
    ]
    return modules, unmapped


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--src", required=True, type=Path,
        help="Path to v-integrity-jde-aais.json (integrity report 0 snapshot).",
    )
    ap.add_argument(
        "--out", type=Path,
        help="Output JSON. Defaults to RRV8/data/dmaai-analysis-latest.json next to --src.",
    )
    ap.add_argument(
        "--cos",
        default="00010,00050",
        help="Comma-separated list of company numbers to include "
             "(defaults to the demo JWT's allowed set).",
    )
    args = ap.parse_args()

    allowed_cos = {c.strip() for c in args.cos.split(",") if c.strip()}
    src = args.src
    if not src.exists():
        raise SystemExit(f"Source not found: {src}")

    out = args.out or (src.parent / "dmaai-analysis-latest.json")

    raw = json.loads(src.read_text(encoding="utf-8"))
    rows = raw["data"] if isinstance(raw, dict) and "data" in raw else raw
    # Restrict to allowed companies (the JWT scope).
    rows = [r for r in rows if r["CompanyNumber"] in allowed_cos]

    fix_first, ask_customer = detect_findings(rows)
    modules, unmapped = build_module_buckets(rows)

    # Headline counts.
    flagged_count = (
        sum(1 for f in fix_first) +
        sum(1 for f in ask_customer)
    )
    # Patterns: distinct issueTypes that actually fired.
    patterns = set(f["issueType"] for f in fix_first) | set(f["issueType"] for f in ask_customer)

    today = datetime.now()
    payload = {
        "_meta": {
            "title":         "DMAAI Configuration Audit",
            "subline": (
                # Finance audience: lead with the action count. Total
                # audited + categorisation belong in the meta strip / cards.
                f"{flagged_count:,} configuration{'s' if flagged_count != 1 else ''} flagged for your review"
            ),
            "source":            "JDE Distribution AAIs (current configuration)",
            "analysisDate":      today.strftime("%Y-%m-%d"),
            "analysisDateLabel": today.strftime("%B %d, %Y"),
            "totalRows":         len(rows),
            "flaggedCount":      flagged_count,
            "patternsCount":     len(patterns),
            "caveat":            DEFAULT_CAVEAT,
            "runId":             today.replace(microsecond=0).isoformat(),
            "unmappedAais":      unmapped,
            "scopedCompanies":   sorted(allowed_cos),
        },
        "fixFirst":     fix_first,
        "askCustomer":  ask_customer,
        "ignoreBlurb":  DEFAULT_IGNORE_BLURB,
        "modules":      modules,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(
        f"Wrote {out} — "
        f"{len(rows):,} rows in scope ({', '.join(sorted(allowed_cos))}), "
        f"{len(fix_first)} fixFirst, {len(ask_customer)} askCustomer, "
        f"{sum(len(v) for v in modules.values()):,} module rows, "
        f"{len(unmapped)} unmapped AAIs"
    )


if __name__ == "__main__":
    main()
