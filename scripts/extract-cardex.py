#!/usr/bin/env python3
"""
extract-cardex.py — capture v6ui_itemrollintegritydialog rows from the
dev SQL Server and patch the `cardex` array inside
RRV8/data/reconciliation.json in place.

The cardex view is current-state (no PeriodEnds column) so this is a
straight `SELECT *`. The Reset row (`Reason = 'Reset:'`) is preserved
at the top of the array because the V8 Cardex Variance page pins it
as the "starting point" of the variance measurement.

Usage (from repo root):
    python3 RRV8/scripts/extract-cardex.py

Reads `$USERPROFILE/.rr-sql-pwd` for the SQL password. Writes the
TSV intermediate to a temp file and re-renders the JSON with the new
cardex array.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT  = Path(__file__).resolve().parent.parent.parent
SNAPSHOT   = REPO_ROOT / "RRV8" / "data" / "reconciliation.json"
SQLCMD     = r"C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\sqlcmd.exe"
PWD_FILE   = Path(os.environ["USERPROFILE"]) / ".rr-sql-pwd"

# Source-of-truth column list (matches the view DDL). Field names land
# in JSON as camelCase first-letter-lowercase to align with the rest
# of reconciliation.json's serialization.
COLS = [
    ("Reason",        "reason",        "str"),
    ("CompanyNumber", "companyNumber", "str"),
    ("LongAccount",   "longAccount",   "str"),
    ("Branch",        "branch",        "str"),
    ("ShortItem",     "shortItem",     "int"),
    ("ItemNumber",    "itemNumber",    "str"),
    ("ThirdItem",     "thirdItem",     "str"),
    ("Location",      "location",      "str"),
    ("Lot",           "lot",           "str"),
    ("Method",        "method",        "str"),
    ("AdjAmount",     "adjAmount",     "money"),
    ("AdjQty",        "adjQty",        "float"),
    ("UOM",           "uom",           "str"),
    ("GLClass",       "glClass",       "str"),
    ("Comment",       "comment",       "str"),
]


def parse_value(raw: str, kind: str):
    s = raw.strip()
    if not s or s.upper() == "NULL":
        return ""
    if kind == "str":
        return s
    if kind == "int":
        try:
            return int(s)
        except ValueError:
            return 0
    if kind == "float":
        try:
            return float(s)
        except ValueError:
            return 0.0
    if kind == "money":
        # sqlcmd renders money as "1234.5678" with trailing zeros; just
        # round to 4 dp for storage parity with the rest of the snapshot.
        try:
            return round(float(s), 4)
        except ValueError:
            return 0.0
    return s


def main() -> None:
    if not PWD_FILE.exists():
        sys.exit(f"Password file missing: {PWD_FILE}")
    if not SNAPSHOT.exists():
        sys.exit(f"Snapshot missing: {SNAPSHOT}")
    pw = PWD_FILE.read_text(encoding="utf-8").strip()

    sep = "|*|"  # multi-char separator so no column value collides
    sql_cols = ", ".join(c[0] for c in COLS)
    # ORDER: Reset row first, then everything else by |AdjAmount| desc
    query = f"""
        SET NOCOUNT ON;
        SELECT {sql_cols}
        FROM v6ui_itemrollintegritydialog
        ORDER BY CASE WHEN Reason = 'Reset:' THEN 0 ELSE 1 END,
                 ABS(AdjAmount) DESC
    """
    # Method calls bind tighter than `+`, so `" + '" + sep + "' + ".join(...)`
    # parses as `" + '" + sep + ("' + ".join(...))`, which mangles the SQL.
    # Pre-build the separator and call .join on it explicitly to side-step
    # the precedence gotcha.
    col_sep = " + '" + sep + "' + "
    col_exprs = [f"ISNULL(CONVERT(varchar(500), {c[0]}), '')" for c in COLS]
    sql_with_concat = (
        "SET NOCOUNT ON; SELECT "
        + col_sep.join(col_exprs)
        + " FROM v6ui_itemrollintegritydialog"
        + " ORDER BY CASE WHEN Reason = 'Reset:' THEN 0 ELSE 1 END, ABS(AdjAmount) DESC"
    )

    print(f"Querying v6ui_itemrollintegritydialog via {SQLCMD} ...")
    result = subprocess.run(
        [SQLCMD, "-S", "localhost", "-U", "rruser", "-P", pw,
         "-d", "RapidReconciler_Dev", "-h", "-1", "-W",
         "-Q", sql_with_concat],
        capture_output=True, text=True, encoding="utf-8",
    )
    if result.returncode != 0:
        sys.exit(f"sqlcmd failed: {result.stderr}")

    rows = []
    for line in result.stdout.splitlines():
        line = line.rstrip("\r")
        if not line.strip():
            continue
        parts = line.split(sep)
        if len(parts) != len(COLS):
            # Skip header/footer noise
            continue
        rec = {}
        for (sql_col, json_key, kind), raw in zip(COLS, parts):
            rec[json_key] = parse_value(raw, kind)
        rows.append(rec)

    if not rows:
        sys.exit("No rows returned — query likely failed.")
    reset_rows = [r for r in rows if r.get("reason") == "Reset:"]
    print(f"  captured {len(rows):,} rows ({len(reset_rows)} Reset row{'s' if len(reset_rows)!=1 else ''})")
    nonempty_comments = sum(1 for r in rows if r.get("comment", "").strip())
    print(f"  non-empty comments: {nonempty_comments}")

    # Patch the snapshot in place. The committed reconciliation.json is
    # minified (single line) — match that format so the git diff only
    # shows the actual cardex array change, not a whole-file reformat.
    payload = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    payload["cardex"] = rows
    SNAPSHOT.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Wrote {SNAPSHOT} (cardex array replaced)")


if __name__ == "__main__":
    main()
