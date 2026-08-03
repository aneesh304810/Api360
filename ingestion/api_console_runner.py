"""
api_console_runner.py — scheduled collection runner.

Runs every collection carrying a schedule_tag against a named environment.
Designed for unattended execution (OpenShift CronJob / Task Scheduler /
Airflow) — restart-safe, off the web pods, evidence-logged like any
interactive run. testAccountId fills {{accountId}}-style path params.

CLI:
  python -m ingestion.api_console_runner --tag daily --env SEI_QA
  python -m ingestion.api_console_runner --tag daily --env SEI_QA --fail-nonzero
"""
from __future__ import annotations

import argparse
import logging
import sys

from ingestion.variance_engine import _catalog
from ingestion.api_console_engine import run_collection

log = logging.getLogger("cp.api360.runner")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")


def run_tag(tag, env_id):
    conn = _catalog()
    cur = conn.cursor()
    cur.execute("""SELECT coll_id, name FROM api_collections
                   WHERE schedule_tag = :t ORDER BY name""", {"t": tag})
    colls = cur.fetchall()
    if not colls:
        log.warning("no collections tagged '%s'", tag)
        return []
    reports = []
    for coll_id, name in colls:
        try:
            rep = run_collection(coll_id, env_id)
            log.info("%s: %d/%d passed", name, rep["passed"], rep["total"])
            reports.append({"name": name, **rep})
        except Exception as exc:                            # noqa: BLE001
            log.error("%s FAILED to run: %s", name, str(exc)[:200])
            reports.append({"name": name, "error": str(exc)[:200],
                            "passed": 0, "total": -1})
    return reports


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--tag", required=True)
    p.add_argument("--env", required=True)
    p.add_argument("--fail-nonzero", action="store_true",
                   help="exit 1 if any request failed (for CronJob alerts)")
    a = p.parse_args()
    reps = run_tag(a.tag, a.env)
    bad = any(r.get("error") or r["passed"] != r["total"] for r in reps)
    for r in reps:
        print(f"{r['name']}: "
              + (r.get("error") or f"{r['passed']}/{r['total']} passed"))
    if a.fail_nonzero and bad:
        sys.exit(1)
