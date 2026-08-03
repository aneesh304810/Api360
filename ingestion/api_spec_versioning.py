"""
api_spec_versioning.py — version snapshots + field-level diff + drift.

Grafts onto Api360Connector with a single call per parsed spec (see
CONNECTOR_DIFF.md). The connector's shred/merge/protect behavior is
untouched; this module only:

  1. snapshots the raw spec into api_spec_versions when its hash changed
  2. field-level diffs the new shred vs the previous snapshot's shred
       BREAKING: field removed · required N->Y flip · type change
       ADDITIVE: new field · required Y->N relaxation
  3. sets drift_status/drift_note on api_sources (BREAKING => DRIFT,
     clearing any prior acknowledgement so new drift is re-surfaced)

Diffing uses the same field shapes the connector writes to api_fields, so
what drift reports is exactly what the catalog stores.
"""
from __future__ import annotations

import hashlib
import json
import logging

log = logging.getLogger("cp.api360.versioning")


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def _field_map(fields: list[dict], endpoint_keys: set) -> dict:
    """(endpoint_key, field_name) -> {type, required} for one source's shred."""
    out = {}
    for f in fields:
        if f["endpoint_key"] in endpoint_keys:
            out[(f["endpoint_key"], f["field_name"])] = {
                "type": f.get("data_type"), "required": f.get("required", "N"),
            }
    return out


def diff_fields(prev: dict, curr: dict) -> tuple[list, list]:
    """Return (breaking, additive) lists of human-readable change strings."""
    breaking, additive = [], []
    for key, meta in prev.items():
        ek, fn = key
        if key not in curr:
            breaking.append(f"{fn} removed from {ek}")
        else:
            c = curr[key]
            if meta.get("required") == "N" and c.get("required") == "Y":
                breaking.append(f"{fn} now required on {ek}")
            elif meta.get("required") == "Y" and c.get("required") == "N":
                additive.append(f"{fn} relaxed to optional on {ek}")
            if (meta.get("type") and c.get("type")
                    and meta["type"] != c["type"]):
                breaking.append(f"{fn} type {meta['type']}->{c['type']} on {ek}")
    for key in curr:
        if key not in prev:
            additive.append(f"{key[1]} added on {key[0]}")
    return breaking, additive


def snapshot_and_diff(conn, source_id: str, release_version: str,
                      raw_text: str, endpoints: list[dict],
                      fields: list[dict]) -> dict | None:
    """Call once per parsed spec, BEFORE loader.load. Returns the diff record
    or None when the spec is unchanged (no snapshot written)."""
    cur = conn.cursor()
    h = _hash(raw_text)
    cur.execute("""SELECT version_no, content_hash FROM api_spec_versions
                   WHERE source_id = :s ORDER BY version_no DESC
                   FETCH FIRST 1 ROWS ONLY""", {"s": source_id})
    row = cur.fetchone()
    if row and row[1] == h:
        return None                                    # unchanged — no-op

    eks = {e["endpoint_key"] for e in endpoints
           if e.get("source_id") == source_id}
    curr_map = _field_map(fields, eks)

    breaking, additive = [], []
    prev_no = row[0] if row else 0
    if row:
        cur.execute("""SELECT diff_summary FROM api_spec_versions
                       WHERE source_id = :s AND version_no = :v""",
                    {"s": source_id, "v": prev_no})
        # previous field map is stored inside diff_summary as field_state
        prev_map = {}
        r2 = cur.fetchone()
        if r2 and r2[0]:
            try:
                doc = json.loads(r2[0].read() if hasattr(r2[0], "read")
                                 else r2[0])
                prev_map = {tuple(k.split("\u241f", 1)): v
                            for k, v in (doc.get("field_state") or {}).items()}
            except Exception:                              # noqa: BLE001
                prev_map = {}
        breaking, additive = diff_fields(prev_map, curr_map)

    summary = {
        "breaking": breaking[:200], "additive": additive[:200],
        "field_state": {f"{k[0]}\u241f{k[1]}": v for k, v in curr_map.items()},
    }
    cur.execute("""INSERT INTO api_spec_versions
        (source_id, version_no, release_version, content_hash, spec_clob,
         diff_summary, breaking_ct, additive_ct)
        VALUES (:s, :v, :rv, :h, :c, :d, :b, :a)""",
        {"s": source_id, "v": prev_no + 1, "rv": (release_version or "")[:60],
         "h": h, "c": raw_text, "d": json.dumps(summary),
         "b": len(breaking), "a": len(additive)})

    if breaking:
        note = "; ".join(breaking[:3])[:990]
        cur.execute("""UPDATE api_sources SET drift_status = 'DRIFT',
            drift_note = :n, drift_ack_by = NULL, drift_ack_at = NULL
            WHERE source_id = :s""", {"n": note, "s": source_id})
        log.warning("api360 drift: %s — %s", source_id, note)
    else:
        cur.execute("""UPDATE api_sources SET drift_status = 'CURRENT'
                       WHERE source_id = :s AND NVL(drift_status,'x') <> 'DRIFT'""",
                    {"s": source_id})
    conn.commit()
    return {"version_no": prev_no + 1, "breaking": breaking,
            "additive": additive}
