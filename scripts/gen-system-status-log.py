"""Generate a deterministic SQL Agent step-log mock for the V8 System Status light.

Output: RRV8/data/system-status-log.json

Production shape (matches what the analyzer's SystemStatusTemplate parses):
  - banner: "System Status Generated <ts>"
  - columns: Capture / Step / Process / StartTime / EndTime / Seconds /
             UpdateCount / ErrorNum
  - 7 nightly cycles, ~25-32 step rows each
  - Data-capture rows: Seconds column holds MINUTES (production convention,
    Mislabeled-by-design; the analyzer divides by 60 on non-DC rows to
    normalize the whole sheet to minutes)
  - Other rows: Seconds column holds true seconds
  - 5 clean cycles, 1 cycle with a slow Cardex Roll Forward (anomaly), 1
    cycle that fails on F4111 with SQL 8152 (String or binary data would
    be truncated) -> partial cycle the analyzer / V8 drawer can light up.

The script is deterministic via a fixed seed so the same JSON falls out
every run. Re-generate when the cycle template shifts.
"""

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

SEED = 20260520
random.seed(SEED)

# Cycle window: last 7 nights leading up to the snapshot timestamp.
SNAPSHOT_TS = datetime(2026, 5, 20, 8, 24, 0)
CYCLE_DATES = [
    datetime(2026, 5, 13, 2, 0, 0),
    datetime(2026, 5, 14, 2, 0, 0),
    datetime(2026, 5, 15, 2, 0, 0),
    datetime(2026, 5, 16, 2, 0, 0),
    datetime(2026, 5, 17, 2, 0, 0),  # the partial cycle
    datetime(2026, 5, 18, 2, 0, 0),  # the slow-Cardex cycle
    datetime(2026, 5, 19, 2, 0, 0),  # most recent (clean)
]

# Data Capture steps (Seconds column holds MINUTES per the production
# mislabel). Each tuple is (process_name, base_minutes, jitter_minutes,
# base_update_count, jitter_update_count). Magnitudes match what a mid-
# size customer's nightly job looks like — F0911 / F4111 each take
# tens of minutes; lookup tables are quick.
DATA_CAPTURE_FEEDS = [
    ("F0911",       35,  6, 124_000, 8_000),   # GL transactions — large
    ("F4111",       50,  8, 187_000, 12_000),  # Item Ledger — largest
    ("F4108",        2,  1,     280,    40),   # Period dates — tiny
    ("F4095",        2,  1,     420,    60),   # DMAAI — tiny
    ("F0902",       12,  3,  18_400, 1_200),   # GL Balances — medium
    ("F4101",       18,  3,  31_200, 2_000),   # Item Master — medium
    ("F4102",       14,  3,  44_500, 3_000),   # Item Branch — medium
    ("F4105",       11,  2,  62_300, 4_000),   # Item Cost — medium
    ("F4115",        6,  2,   8_900,   600),   # Cost Components — small
    ("F0006",        2,  1,     320,    40),   # Business Units — tiny
    ("F0901",        4,  1,   4_200,   400),   # Account Master — small
]

# RapidReconciler computation steps (Seconds column holds true SECONDS).
# Tuples: (process_name, base_seconds, jitter_seconds, update_count).
# Multi-minute steps in seconds to match production magnitudes —
# e.g. End-of-day snapshot ~25 min, Roll cardex ~30 min.
RECONCILER_STEPS = [
    ("Reset variances",             45,   10,        0),
    ("Compute carry forward",      360,   60,   18_400),
    ("Sum unposted batches",       180,   30,        0),
    ("End of day snapshot",      1_500,  240,  187_000),  # ~25 min
    ("Roll cardex forward",      1_800,  300,  187_000),  # ~30 min
    ("Compute manual JEs",         220,   40,    1_200),
    ("Compute transactions",       720,  120,   91_000),  # ~12 min
    ("Reconcile by company",       420,   60,        0),  # ~7 min
    ("Update period summary",      150,   30,        0),
    ("Index rebuild",              900,  150,        0),  # ~15 min
    ("Refresh dashboard cache",    120,   20,        0),
]


def jitter(base: int, span: int) -> int:
    """Deterministic positive integer in [base - span, base + span]."""
    if span <= 0:
        return base
    return base + random.randint(-span, span)


def fmt_ts(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def build_cycle(cycle_start: datetime, mode: str) -> list[dict]:
    """Build a cycle's step rows.

    mode: 'clean' | 'partial-f4111' | 'slow-cardex'
    """
    capture_label = "A to C " + cycle_start.strftime("%Y-%m-%d %H:%M")
    cursor = cycle_start
    rows: list[dict] = []

    def push(step: str, process: str, secs: int, update_count: int, error: int = 0) -> None:
        nonlocal cursor
        # Data-capture rows: 'secs' is interpreted as MINUTES below at
        # the cursor advance, but the Seconds column stores it raw
        # (production mislabel preserved).
        end = cursor + (timedelta(minutes=secs) if step == "Data Capture" else timedelta(seconds=secs))
        rows.append({
            "capture":     capture_label,
            "step":        step,
            "process":     process,
            "starttime":   fmt_ts(cursor),
            "endtime":     fmt_ts(end),
            "seconds":     secs,
            "updateCount": update_count,
            "errorNum":    error,
        })
        cursor = end

    # Cycle start marker
    push("Data Capture", "Starting A to B *********************", 0, 0)

    # Data-capture per feed
    for process, base_min, span_min, base_upd, span_upd in DATA_CAPTURE_FEEDS:
        secs = max(1, jitter(base_min, span_min))
        upd = max(0, jitter(base_upd, span_upd))

        # Partial cycle: fail on F4111 with SQL 8152
        if mode == "partial-f4111" and process == "F4111":
            push("Data Capture", process, secs, 0, error=8152)
            return rows  # cycle stops here — no further rows, no Successful Completed marker

        push("Data Capture", process, secs, upd)

    # B-to-C marker
    push("Data Capture", "Starting B to C *********************", 0, 0)

    # RapidReconciler computation steps
    for process, base_sec, span_sec, upd in RECONCILER_STEPS:
        secs = max(1, jitter(base_sec, span_sec))

        # Slow-Cardex cycle: blow Roll cardex forward up to ~4x median
        if mode == "slow-cardex" and process == "Roll cardex forward":
            secs = secs * 4

        push("RapidReconciler", process, secs, upd)

    # End marker
    push("RapidReconciler", "Successfully Completed", 0, 0)
    return rows


def build_adhoc_sprocs(after_cycle_end: datetime) -> list[dict]:
    """Insert a few ad-hoc sproc rows between cycles.

    These represent a DBA running individual sprocs (via SSMS or
    direct Agent step) outside the nightly job. Empty Capture means
    they're not part of any cycle — the analyzer / V8 drawer must
    exclude them from pattern analysis. Includes one deliberately
    slow row to confirm the exclusion (without the fix, that row
    would fire a false anomaly).
    """
    adhoc = [
        ("Manual sproc", "exec usp6getrinvaccountsummary @period='2026-05-16'",   120,        0),
        ("Manual sproc", "exec usp6getfilteredview @viewname='v6ui_raccountsummary'", 80,     0),
        # Deliberately slow ad-hoc sproc — without the cycle-only fix
        # this would surface as a false anomaly in the diagnosis.
        ("Manual sproc", "exec usp6getrcardexledgercompare",                       1_800,     0),
    ]
    cursor = after_cycle_end + timedelta(hours=8)  # mid-afternoon, after the nightly cycle finished
    rows: list[dict] = []
    for step, process, secs, upd in adhoc:
        end = cursor + timedelta(seconds=secs)
        rows.append({
            "capture":     "",  # standalone — no cycle association
            "step":        step,
            "process":     process,
            "starttime":   fmt_ts(cursor),
            "endtime":     fmt_ts(end),
            "seconds":     secs,
            "updateCount": upd,
            "errorNum":    0,
        })
        cursor = end + timedelta(hours=1)  # spread across the afternoon
    return rows


def main() -> None:
    all_rows: list[dict] = []
    for i, cycle_start in enumerate(CYCLE_DATES):
        if i == 4:
            mode = "partial-f4111"
        elif i == 5:
            mode = "slow-cardex"
        else:
            mode = "clean"
        cycle_rows = build_cycle(cycle_start, mode)
        all_rows.extend(cycle_rows)
        # Slip in ad-hoc sproc rows between the May 16 cycle and the
        # May 17 partial. One realistic spot — DBA poking around the
        # day before things broke.
        if i == 3:
            cycle_end_ts = datetime.strptime(cycle_rows[-1]["endtime"], "%Y-%m-%d %H:%M:%S")
            all_rows.extend(build_adhoc_sprocs(cycle_end_ts))

    # Average cycle duration in minutes (rounded) — feeds currentJob.avgMinutes.
    cycle_totals = []
    for cs in CYCLE_DATES:
        rs = [r for r in all_rows if r["capture"].endswith(cs.strftime("%Y-%m-%d %H:%M"))]
        if not rs: continue
        total = sum(r["seconds"] if r["step"] == "Data Capture" else r["seconds"] / 60 for r in rs)
        cycle_totals.append(total)
    avg_min = round(sum(cycle_totals) / len(cycle_totals)) if cycle_totals else 0

    out = {
        "_meta": {
            "captured":    SNAPSHOT_TS.isoformat() + "Z",
            "source":      "SQL Agent step log (mock)",
            "db":          "RapidReconciler_Dev",
            "seed":        SEED,
            "cycles":      len(CYCLE_DATES),
            "rows":        len(all_rows),
            "convention":  "Data-capture rows: Seconds column = MINUTES. Other rows: Seconds column = true seconds. Production mislabel preserved."
        },
        "currentJob": {
            "_source":    "Mocks v_diagnostic5_job_status. Production: SELECT * FROM dbo.v_diagnostic5_job_status. In prod the agent polls this and feeds it to the System Status light. Flip jobStatus to 'In Progress' to demo the amber state.",
            "jobStatus":  "Successful",
            "jobDate":    CYCLE_DATES[-1].strftime("%b %d %Y %I:%M%p").replace(" 0", " "),
            "minutes":    0,
            "avgMinutes": avg_min,
            "count":      len([c for c in cycle_totals]),
        },
        "banner":  "System Status Generated " + SNAPSHOT_TS.strftime("%Y-%m-%d %H:%M:%S"),
        "columns": ["Capture", "Step", "Process", "StartTime", "EndTime", "Seconds", "UpdateCount", "ErrorNum"],
        "rows":    all_rows,
    }

    # Repo-root-relative path: this script lives in RRV8/scripts/, the
    # data lives in RRV8/data/. Resolve via __file__ so the script runs
    # from any cwd.
    target = Path(__file__).resolve().parent.parent / "data" / "system-status-log.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"Wrote {target} ({len(all_rows)} rows across {len(CYCLE_DATES)} cycles)")


if __name__ == "__main__":
    main()
