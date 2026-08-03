"""routers_api360_console.py — API 360 Console API.

Secrets are write-only (env:/enc: refs). Responses are PII-masked by the
engine before they reach this layer. Everything is evidence-logged.
"""
from __future__ import annotations

import json
import threading

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/apicon", tags=["api360-console"])


def _eng():
    from ingestion import api_console_engine as e
    return e


def _cur():
    from ingestion.variance_engine import _catalog
    conn = _catalog()
    return conn, conn.cursor()


def _rows(cur):
    cols = [c[0].lower() for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _safe(fn):
    try:
        return fn()
    except Exception as e:                                  # noqa: BLE001
        return {"error": str(e)[:300]}


# ------------------------------ environments -------------------------------
class EnvIn(BaseModel):
    env_id: str | None = None
    name: str
    base_note: str | None = None
    provider_system: str | None = None
    vars: list[dict] = []      # [{name, value, kind, secret_env_ref?}]


@router.get("/environments")
def environments():
    def go():
        conn, cur = _cur()
        cur.execute("SELECT env_id, name, base_note, "
                    "NVL(provider_system,'SEI') AS provider_system, "
                    "NVL(enabled,'Y') AS enabled "
                    "FROM api_environments ORDER BY name")
        envs = _rows(cur)
        for e in envs:
            e["vars"] = [{"name": k, "value": v}
                         for k, v in _eng().env_vars(e["env_id"]).items()]
        return {"environments": envs}
    return _safe(go)


@router.post("/environments")
def save_environment(body: EnvIn):
    def go():
        from ingestion.datasource_registry import make_secret_ref
        conn, cur = _cur()
        env_id = body.env_id or body.name.upper().replace(" ", "_")[:40]
        cur.execute("""MERGE INTO api_environments d
            USING (SELECT :e AS env_id FROM dual) s ON (d.env_id = s.env_id)
            WHEN MATCHED THEN UPDATE SET name = :n, base_note = :b,
                 provider_system = :ps
            WHEN NOT MATCHED THEN INSERT
                 (env_id, name, base_note, provider_system)
                 VALUES (:e, :n, :b, :ps)""",
            {"e": env_id, "n": body.name, "b": body.base_note,
             "ps": (body.provider_system or "SEI").upper()})
        for v in body.vars:
            kind = (v.get("kind") or "PLAIN").upper()
            val = v.get("value")
            if kind == "SECRET":
                if v.get("secret_env_ref"):
                    val = make_secret_ref(None, v["secret_env_ref"])
                elif val and not val.startswith(("env:", "enc:")) \
                        and "\u25cf" not in val:
                    val = make_secret_ref(val, None)
                elif "\u25cf" in (val or ""):
                    continue        # untouched masked placeholder
            cur.execute("""MERGE INTO api_env_vars t
                USING (SELECT :e AS env_id, :k AS var_name FROM dual) s
                ON (t.env_id = s.env_id AND t.var_name = s.var_name)
                WHEN MATCHED THEN UPDATE SET var_value = :v, var_kind = :kd
                WHEN NOT MATCHED THEN INSERT
                     (env_id, var_name, var_value, var_kind)
                     VALUES (:e, :k, :v, :kd)""",
                {"e": env_id, "k": v["name"], "v": val, "kd": kind})
        conn.commit()
        return {"ok": True, "env_id": env_id}
    return _safe(go)


# ------------------------------- contracts ---------------------------------
class ContractIn(BaseModel):
    api_name: str
    version: str
    spec_json: str
    provider_system: str = "SEI"





@router.get("/admin/system/{code}")
def admin_system(code: str):
    """Catalog Admin detail pane — aggregates the UNIFIED catalog
    (api_sources / api_endpoints / api_business_flows) for one system."""
    def go():
        conn, cur = _cur()
        clause = ("project_id = 'sei'" if code == "sei"
                  else "project_id <> 'sei'" if code == "non-sei"
                  else "project_id = :c")
        p = {} if code in ("sei", "non-sei") else {"c": code}
        cur.execute(f"""SELECT source_id, display_name, feature_group,
                               release_version, endpoint_count,
                               NVL(drift_status,'CURRENT') AS drift_status,
                               drift_note, drift_ack_by, spec_path
                        FROM api_sources WHERE {clause}
                        ORDER BY feature_group, source_id""", p)
        sources = _rows(cur)
        cur.execute(f"""SELECT COUNT(*) FROM api_endpoints WHERE {clause}""", p)
        n_ep = cur.fetchone()[0]
        cur.execute(f"""SELECT COUNT(*) FROM api_business_flows
                        WHERE {clause} AND is_published = 'Y'""", p)
        n_flows = cur.fetchone()[0]
        cur.execute("""SELECT COUNT(*) FROM api_history
                       WHERE ran_at > SYSTIMESTAMP - 7
                         AND status_code BETWEEN 200 AND 299""")
        ok7 = cur.fetchone()[0]
        cur.execute("""SELECT COUNT(*) FROM api_history
                       WHERE ran_at > SYSTIMESTAMP - 7""")
        all7 = cur.fetchone()[0]
        return {"code": code, "sources": sources,
                "metrics": {"sources": len(sources), "endpoints": n_ep,
                            "published_flows": n_flows,
                            "open_drift": sum(1 for x in sources
                                              if x["drift_status"] == "DRIFT"
                                              and not x.get("drift_ack_by")),
                            "pass_rate_7d": (round(100 * ok7 / all7)
                                             if all7 else None)}}
    return _safe(go)

@router.post("/environments/{env_id}/test")
def env_test(env_id: str):
    """Reachability probe: GET the environment baseUrl."""
    def go():
        import time as _t
        try:
            import requests as _rq
        except ImportError:
            return {"error": "requests not installed"}
        v = _eng().env_vars(env_id, resolve_secrets=True)
        base = v.get("baseUrl")
        if not base:
            return {"error": "no baseUrl variable"}
        t0 = _t.time()
        try:
            r = _rq.get(base, timeout=8)
            return {"ok": True, "status": r.status_code,
                    "elapsed_ms": int((_t.time() - t0) * 1000)}
        except Exception as e:                              # noqa: BLE001
            return {"ok": False, "error": str(e)[:200],
                    "elapsed_ms": int((_t.time() - t0) * 1000)}
    return _safe(go)


# --------------------- drift acknowledgement + lifecycle -------------------


@router.delete("/collections/{coll_id}")
def delete_collection(coll_id: str):
    """MANUAL/POSTMAN collections only — AUTO collections are owned by
    their contract and refresh on ingest; deleting them would silently
    resurrect."""
    def go():
        conn, cur = _cur()
        cur.execute("SELECT source FROM api_collections WHERE coll_id=:c",
                    {"c": coll_id})
        row = cur.fetchone()
        if not row:
            return {"error": "unknown collection"}
        if row[0] == "AUTO":
            return {"error": "AUTO collections are contract-owned — "
                    "retire the contract instead"}
        cur.execute("DELETE FROM api_requests WHERE coll_id = :c",
                    {"c": coll_id})
        cur.execute("DELETE FROM api_collections WHERE coll_id = :c",
                    {"c": coll_id})
        conn.commit()
        return {"ok": True}
    return _safe(go)


@router.post("/collections/{coll_id}/schedule")
def set_schedule(coll_id: str, tag: str | None = None):
    def go():
        conn, cur = _cur()
        cur.execute("""UPDATE api_collections SET schedule_tag = :t
                       WHERE coll_id = :c""", {"t": tag or None,
                                               "c": coll_id})
        conn.commit()
        return {"ok": True, "schedule_tag": tag}
    return _safe(go)


@router.post("/environments/{env_id}/enabled")
def set_env_enabled(env_id: str, enabled: str = "Y"):
    def go():
        conn, cur = _cur()
        cur.execute("""UPDATE api_environments SET enabled = :e
                       WHERE env_id = :i""",
                    {"e": "Y" if enabled == "Y" else "N", "i": env_id})
        conn.commit()
        return {"ok": True}
    return _safe(go)



# ------------------------------ code decodes -------------------------------
class DecodeIn(BaseModel):
    decode_set: str
    code: str
    meaning: str


@router.get("/decodes")
def decodes(decode_set: str | None = None):
    def go():
        conn, cur = _cur()
        if decode_set:
            cur.execute("""SELECT decode_set, code, meaning
                           FROM api_code_decodes WHERE decode_set = :s
                           ORDER BY code""", {"s": decode_set})
        else:
            cur.execute("""SELECT decode_set, code, meaning
                           FROM api_code_decodes
                           ORDER BY decode_set, code""")
        return {"decodes": _rows(cur)}
    return _safe(go)


@router.post("/decodes")
def save_decode(body: DecodeIn):
    def go():
        conn, cur = _cur()
        cur.execute("""MERGE INTO api_code_decodes d
            USING (SELECT :s AS ds, :c AS cd FROM dual) x
            ON (d.decode_set = x.ds AND d.code = x.cd)
            WHEN MATCHED THEN UPDATE SET meaning = :m
            WHEN NOT MATCHED THEN INSERT (decode_set, code, meaning)
                 VALUES (:s, :c, :m)""",
            {"s": body.decode_set.upper(), "c": body.code,
             "m": body.meaning})
        conn.commit()
        # invalidate engine cache
        try:
            from ingestion.api_console_engine import _DECODES
            _DECODES.pop(body.decode_set.upper(), None)
        except Exception:                                   # noqa: BLE001
            pass
        return {"ok": True}
    return _safe(go)


# ------------------------------ collections --------------------------------
@router.get("/collections")
def collections():
    def go():
        conn, cur = _cur()
        cur.execute("""SELECT c.coll_id, c.name, c.source,
                              NVL(c.provider_system, 'sei')
                              AS provider_system,
                              c.schedule_tag,
                              (SELECT COUNT(*) FROM api_requests r
                               WHERE r.coll_id = c.coll_id) AS n_requests
                       FROM api_collections c ORDER BY c.name""")
        return {"collections": _rows(cur)}
    return _safe(go)


@router.get("/collections/{coll_id}/requests")
def coll_requests(coll_id: str):
    def go():
        conn, cur = _cur()
        cur.execute("""SELECT req_id, folder, name, method, url_tmpl,
                              params_json, headers_json, tests_json,
                              endpoint_key
                       FROM api_requests WHERE coll_id = :c
                       ORDER BY folder, sort_order""", {"c": coll_id})
        return {"requests": _rows(cur)}
    return _safe(go)


class BuildIn(BaseModel):
    name: str
    req_ids: list[str]
    shared: str = "Y"


@router.post("/collections/build")
def build_collection(body: dict):
    """Build a MANUAL collection either from catalog endpoints
    ({name, endpoints:[{endpoint_key,method,name,url}]}) or by copying
    existing requests ({name, req_ids:[..]})."""
    def go():
        conn, cur = _cur()
        import uuid, json as _j
        coll_id = f"C{uuid.uuid4().hex[:12]}"
        cur.execute("""INSERT INTO api_collections
            (coll_id, name, source, shared) VALUES (:1,:2,'MANUAL',:3)""",
            [coll_id, body.get("name", "Untitled"),
             body.get("shared", "Y")])
        eps = body.get("endpoints") or []
        for i, ep in enumerate(eps):
            url = ep.get("url") or ""
            # template path params: /accounts/{id} -> /accounts/{{id}}
            url = __import__("re").sub(r"\{(\w+)\}", r"{{\1}}", url)
            if url and not url.startswith("http"):
                url = "{{baseUrl}}" + ("" if url.startswith("/") else "/") \
                      + url
            cur.execute("""INSERT INTO api_requests
                (req_id, coll_id, folder, name, method, url_tmpl,
                 params_json, headers_json, tests_json, sort_order,
                 endpoint_key)
                VALUES (:1,:2,NULL,:3,:4,:5,'{}','{}',:6,:7,:8)""",
                [f"R{uuid.uuid4().hex[:12]}", coll_id,
                 (ep.get("name") or ep.get("endpoint_key") or "")[:250],
                 ep.get("method", "GET"), url[:1000],
                 _j.dumps(["status == 200"]), i,
                 (ep.get("endpoint_key") or "")[:520] or None])
        for i, rid in enumerate(body.get("req_ids") or []):
            cur.execute("""INSERT INTO api_requests
                (req_id, coll_id, folder, name, method, url_tmpl,
                 params_json, headers_json, body_tmpl, tests_json,
                 sort_order)
                SELECT :nid, :c, folder, name, method, url_tmpl,
                       params_json, headers_json, body_tmpl, tests_json, :i
                FROM api_requests WHERE req_id = :rid""",
                {"nid": f"R{uuid.uuid4().hex[:12]}", "c": coll_id,
                 "i": len(eps) + i, "rid": rid})
        conn.commit()
        return {"ok": True, "coll_id": coll_id,
                "n": len(eps) + len(body.get("req_ids") or [])}
    return _safe(go)



@router.post("/collections/import-postman")
def import_postman(body: PostmanIn):
    return _safe(lambda: _eng().import_postman(
        json.loads(body.collection_json)))


@router.get("/collections/{coll_id}/export-postman")
def export_postman(coll_id: str):
    return _safe(lambda: _eng().export_postman(coll_id))


@router.post("/collections/{coll_id}/run")
def run_collection(coll_id: str, env_id: str):
    return _safe(lambda: _eng().run_collection(coll_id, env_id))


# -------------------------------- execute ----------------------------------
class ExecIn(BaseModel):
    env_id: str
    method: str
    url: str
    params: dict = {}
    headers: dict = {}
    body: str | None = None
    tests: list[str] = []
    req_id: str | None = None
    endpoint_key: str | None = None


@router.post("/execute")
def execute(body: ExecIn):
    extra = {"_endpoint_key": body.endpoint_key} if body.endpoint_key \
        else None
    return _safe(lambda: _eng().execute(
        body.env_id, body.method, body.url, body.params, body.headers,
        body.body, body.tests, req_id=body.req_id, extra_ctx=extra))


@router.get("/history")
def history():
    def go():
        conn, cur = _cur()
        cur.execute("""SELECT * FROM (
            SELECT method, url_final, status_code, elapsed_ms, schema_ok,
                   TO_CHAR(ran_at,'HH24:MI') AS ran_at
            FROM api_history ORDER BY ran_at DESC) WHERE ROWNUM <= 25""")
        return {"history": _rows(cur)}
    return _safe(go)



@router.post("/requests/save")
def save_request(body: SaveReqIn):
    """Console 'Save' button: store the current request into a MANUAL
    collection (created on first use)."""
    def go():
        conn, cur = _cur()
        import uuid
        cur.execute("""SELECT coll_id FROM api_collections
                       WHERE name = :n AND source = 'MANUAL'""",
                    {"n": body.coll_name})
        row = cur.fetchone()
        coll_id = row[0] if row else f"C{uuid.uuid4().hex[:12]}"
        if not row:
            cur.execute("""INSERT INTO api_collections
                (coll_id, name, source) VALUES (:1, :2, 'MANUAL')""",
                [coll_id, body.coll_name])
        cur.execute("""INSERT INTO api_requests
            (req_id, coll_id, folder, name, method, url_tmpl, params_json,
             headers_json, body_tmpl, tests_json, sort_order)
            VALUES (:1,:2,'Saved',:3,:4,:5,:6,:7,:8,:9,
                    (SELECT NVL(MAX(sort_order),0)+1 FROM api_requests
                     WHERE coll_id = :2))""",
            [f"R{uuid.uuid4().hex[:12]}", coll_id, body.name, body.method,
             body.url, json.dumps(body.params), json.dumps(body.headers),
             body.body, json.dumps(body.tests)])
        conn.commit()
        return {"ok": True, "coll_id": coll_id}
    return _safe(go)


@router.get("/environments/{env_id}/export-postman-env")
def export_postman_env(env_id: str):
    """Postman environment export — secret values blanked by design."""
    def go():
        vals = _eng().env_vars(env_id)          # secrets already masked
        return {"name": env_id,
                "values": [{"key": k,
                            "value": "" if "●" in str(v) else v,
                            "type": "secret" if "●" in str(v)
                            else "default", "enabled": True}
                           for k, v in vals.items()],
                "_postman_variable_scope": "environment"}
    return _safe(go)


# --------------------------------- flows -----------------------------------
class FlowIn(BaseModel):
    flow_id: str | None = None
    name: str
    description: str | None = None
    tile_icon: str | None = "🧾"
    inputs: list[dict] = []
    steps: list[dict] = []
    published: str = "N"
    reviewed: str = "N"     # sign-off flag — required to publish write flows





# --------------------------------- guided ----------------------------------


# ============================================================================
# UNIFIED CATALOG  (api_sources / api_endpoints / api_spec_versions)
# ============================================================================
def _pclause(system, col="project_id"):
    if not system or system == "all":
        return "1=1", {}
    if system == "sei":
        return f"{col} = 'sei'", {}
    if system == "non-sei":
        return f"{col} <> 'sei'", {}
    return f"{col} = :sys", {"sys": system}


@router.get("/catalog/systems")
def catalog_systems():
    """Systems = DISTINCT project_id (+ resolver's known-but-empty systems)."""
    def go():
        conn, cur = _cur()
        cur.execute("""SELECT project_id, COUNT(*) n,
                              SUM(CASE WHEN drift_status='DRIFT'
                                        AND drift_ack_by IS NULL
                                       THEN 1 ELSE 0 END) drift
                       FROM api_sources GROUP BY project_id""")
        have = {r[0]: {"code": r[0], "sources": r[1], "drift": r[2] or 0}
                for r in cur.fetchall()}
        known = ["sei", "internal", "addvantage", "pivotal",
                 "charles_river", "bloomberg"]
        out = [have.get(k, {"code": k, "sources": 0, "drift": 0})
               for k in known]
        out += [v for k, v in have.items() if k not in known]
        return {"systems": out}
    return _safe(go)


@router.post("/catalog/upload")
def catalog_upload(body: dict):
    """UI upload = write the spec INTO the artifacts tree, then run the
    connector on that one file. body: {system, domain, filename, content}"""
    def go():
        from ingestion.api_catalog_ingest import place, scan
        dest = place(body.get("system", "sei"), body.get("domain", "General"),
                     body.get("filename", "uploaded.yaml"),
                     body.get("content", ""))
        result = scan(str(dest))
        conn, cur = _cur()
        cur.execute("""SELECT source_id, NVL(drift_status,'CURRENT'),
                              drift_note FROM api_sources
                       WHERE spec_path = :p""", {"p": str(dest)})
        row = cur.fetchone()
        return {"ok": True, "placed": str(dest), **result,
                "source_id": row[0] if row else None,
                "drift_status": row[1] if row else None,
                "drift_note": row[2] if row else None}
    return _safe(go)


@router.post("/catalog/scan")
def catalog_scan():
    def go():
        from ingestion.api_catalog_ingest import scan
        return {"ok": True, **scan()}
    return _safe(go)


@router.get("/catalog/versions/{source_id}")
def catalog_versions(source_id: str):
    def go():
        conn, cur = _cur()
        cur.execute("""SELECT version_no, release_version, ingested_at,
                              breaking_ct, additive_ct
                       FROM api_spec_versions WHERE source_id = :s
                       ORDER BY version_no DESC""", {"s": source_id})
        return {"source_id": source_id, "versions": _rows(cur)}
    return _safe(go)


@router.get("/catalog/diff/{source_id}/{version_no}")
def catalog_diff(source_id: str, version_no: int):
    def go():
        conn, cur = _cur()
        cur.execute("""SELECT diff_summary FROM api_spec_versions
                       WHERE source_id = :s AND version_no = :v""",
                    {"s": source_id, "v": version_no})
        row = cur.fetchone()
        if not row or not row[0]:
            return {"breaking": [], "additive": []}
        import json as _j
        doc = _j.loads(row[0].read() if hasattr(row[0], "read") else row[0])
        return {"breaking": doc.get("breaking", []),
                "additive": doc.get("additive", [])}
    return _safe(go)


@router.post("/catalog/sources/{source_id}/ack-drift")
def catalog_ack_drift(source_id: str, by: str = "admin"):
    def go():
        conn, cur = _cur()
        cur.execute("""UPDATE api_sources
            SET drift_ack_by = :b, drift_ack_at = SYSTIMESTAMP
            WHERE source_id = :s AND drift_status = 'DRIFT'""",
            {"b": by, "s": source_id})
        conn.commit()
        return {"ok": True}
    return _safe(go)


@router.get("/catalog/drift/unread")
def catalog_drift_unread():
    def go():
        conn, cur = _cur()
        cur.execute("""SELECT COUNT(*) FROM api_sources
                       WHERE drift_status = 'DRIFT'
                         AND drift_ack_by IS NULL""")
        return {"unread": cur.fetchone()[0]}
    return _safe(go)


@router.get("/catalog/endpoints")
def catalog_endpoints(system: str | None = None, q: str | None = None,
                      feature_group: str | None = None, limit: int = 300):
    """Collections tree / picker source — reads the design-time catalog."""
    def go():
        conn, cur = _cur()
        clause, p = _pclause(system)
        p["lim"] = limit
        if feature_group:
            clause += " AND feature_group = :fg"; p["fg"] = feature_group
        if q:
            clause += (" AND (UPPER(operation_id) LIKE :q "
                       "OR UPPER(summary) LIKE :q OR UPPER(path) LIKE :q)")
            p["q"] = f"%{q.upper()}%"
        cur.execute(f"""SELECT endpoint_key, source_id, method, path,
                               operation_id, summary, feature_group,
                               project_id, full_endpoint_url
                        FROM api_endpoints WHERE {clause}
                        ORDER BY feature_group, path
                        FETCH FIRST :lim ROWS ONLY""", p)
        return {"endpoints": _rows(cur)}
    return _safe(go)


@router.get("/catalog/suggest")
def catalog_suggest(q: str, system: str | None = None, limit: int = 8):
    """Typeahead: opId-prefix > summary-word > path-substring."""
    def go():
        conn, cur = _cur()
        clause, p = _pclause(system)
        p.update({"pfx": f"{q.upper()}%", "any": f"%{q.upper()}%",
                  "lim": limit})
        cur.execute(f"""SELECT endpoint_key, method, path, operation_id,
                               summary, feature_group,
                               CASE WHEN UPPER(operation_id) LIKE :pfx THEN 0
                                    WHEN UPPER(summary) LIKE :any THEN 1
                                    ELSE 2 END rnk
                        FROM api_endpoints
                        WHERE {clause} AND (UPPER(operation_id) LIKE :any
                              OR UPPER(summary) LIKE :any
                              OR UPPER(path) LIKE :any)
                        ORDER BY rnk, LENGTH(operation_id)
                        FETCH FIRST :lim ROWS ONLY""", p)
        return {"suggestions": _rows(cur)}
    return _safe(go)


def _entity_maps(cur):
    """producer/consumer maps from BOTH knowledge sources:
    api_dependencies (dep_type='needs:<ent>', Postman-derived) UNION
    api_business_flow_steps.produces_entity/consumes_entity (curated)."""
    consumes, producer_of = {}, {}
    cur.execute("""SELECT from_endpoint, to_endpoint, dep_type
                   FROM api_dependencies""")
    for frm, to, dt in cur.fetchall():
        ent = (dt or "")[6:] if (dt or "").startswith("needs:") else None
        if not ent:
            continue
        consumes.setdefault(frm, set()).add(ent)
        producer_of.setdefault(ent, to)
    cur.execute("""SELECT endpoint_key, produces_entity, consumes_entity
                   FROM api_business_flow_steps
                   WHERE endpoint_key IS NOT NULL""")
    for ek, prod, cons in cur.fetchall():
        for ent in (prod or "").split(","):
            ent = ent.strip()
            if ent:
                producer_of.setdefault(ent, ek)
        for ent in (cons or "").split(","):
            ent = ent.strip()
            if ent:
                consumes.setdefault(ek, set()).add(ent)
    return consumes, producer_of


@router.get("/catalog/suggest/next")
def catalog_suggest_next(endpoint_key: str, have: str = ""):
    """Graph suggestions: consumers of what `endpoint_key` produces, plus
    prerequisite warnings for entities nothing in `have` produces."""
    def go():
        conn, cur = _cur()
        consumes, producer_of = _entity_maps(cur)
        produced_ents = {e for e, prod in producer_of.items()
                         if prod == endpoint_key}
        nxt = [{"endpoint_key": ek, "needs": sorted(es & produced_ents)}
               for ek, es in consumes.items() if es & produced_ents
               and ek != endpoint_key][:10]
        have_keys = [h for h in have.split(",") if h]
        have_produce = set()
        for hk in have_keys + [endpoint_key]:
            have_produce |= {e for e, p in producer_of.items() if p == hk}
        warnings = []
        for hk in have_keys:
            for ent in consumes.get(hk, set()):
                if ent not in have_produce:
                    warnings.append({"endpoint_key": hk,
                                     "missing_entity": ent,
                                     "producer": producer_of.get(ent)})
        if not consumes.get(endpoint_key) and not produced_ents:
            return {"next": [], "warnings": warnings,
                    "note": "no dependency data for this endpoint"}
        return {"next": nxt, "warnings": warnings}
    return _safe(go)


# ============================================================================
# UNIFIED FLOWS  (api_business_flows + bindings sidecar)
# ============================================================================
@router.get("/flows")
def flows(system: str | None = None):
    def go():
        conn, cur = _cur()
        clause, p = _pclause(system, "f.project_id")
        cur.execute(f"""SELECT f.flow_id,
                               NVL(f.business_name, f.generated_name) name,
                               f.goal, f.domain, f.origin, f.is_published,
                               f.step_count,
                               CASE WHEN b.flow_id IS NULL THEN 'N'
                                    ELSE 'Y' END runnable
                        FROM api_business_flows f
                        LEFT JOIN api_flow_bindings b
                               ON b.flow_id = f.flow_id
                        WHERE {clause}
                        ORDER BY f.domain, name""", p)
        return {"flows": _rows(cur)}
    return _safe(go)


@router.get("/flows/{flow_id}")
def flow_detail(flow_id: str):
    def go():
        from ingestion.api_console_engine import _load_business_flow
        return _load_business_flow(flow_id)
    return _safe(go)


@router.post("/flows/{flow_id}/bindings")
def save_bindings(flow_id: str, body: dict):
    """Attach/replace runtime bindings. body: {inputs, present, tile_icon,
    steps: [{step_order, params, body, extract, foreach}]}.
    Publishing a flow with POST/PUT steps requires signed_off=true."""
    def go():
        import json as _j
        conn, cur = _cur()
        cur.execute("""SELECT s.step_order, e.method
                       FROM api_business_flow_steps s
                       LEFT JOIN api_endpoints e
                              ON e.endpoint_key = s.endpoint_key
                       WHERE s.flow_id = :f""", {"f": flow_id})
        methods = {r[0]: (r[1] or "GET") for r in cur.fetchall()}
        if not methods:
            return {"error": "flow has no steps in api_business_flow_steps"}
        writes = any(m in ("POST", "PUT", "PATCH", "DELETE")
                     for m in methods.values())
        if writes and not body.get("signed_off"):
            return {"error": "flow contains write operations — sign-off "
                             "checkbox required", "requires_signoff": True}
        cur.execute("""MERGE INTO api_flow_bindings b
            USING (SELECT :f AS flow_id FROM dual) x
               ON (b.flow_id = x.flow_id)
            WHEN MATCHED THEN UPDATE SET inputs_json=:i, present_json=:p,
                 tile_icon=:t, reviewed=:r, updated_at=SYSTIMESTAMP
            WHEN NOT MATCHED THEN INSERT
                 (flow_id, inputs_json, present_json, tile_icon, reviewed)
                 VALUES (:f, :i, :p, :t, :r)""",
            {"f": flow_id, "i": _j.dumps(body.get("inputs") or []),
             "p": _j.dumps(body.get("present")) if body.get("present")
                  else None,
             "t": (body.get("tile_icon") or "")[:8] or None,
             "r": "Y" if body.get("reviewed") else "N"})
        cur.execute("DELETE FROM api_flow_step_bindings WHERE flow_id=:f",
                    {"f": flow_id})
        for st in (body.get("steps") or []):
            cur.execute("""INSERT INTO api_flow_step_bindings
                (flow_id, step_order, params_json, body_json, extract_json,
                 foreach) VALUES (:f,:o,:p,:b,:x,:e)""",
                {"f": flow_id, "o": st.get("step_order"),
                 "p": _j.dumps(st.get("params") or {}),
                 "b": _j.dumps(st.get("body")) if st.get("body") else None,
                 "x": _j.dumps(st.get("extract") or {}),
                 "e": (st.get("foreach") or "")[:200] or None})
        conn.commit()
        return {"ok": True, "flow_id": flow_id,
                "runnable": True, "writes": writes}
    return _safe(go)


@router.post("/flows/{flow_id}/run")
def flow_run(flow_id: str, body: dict):
    def go():
        from ingestion.api_console_engine import run_flow
        return run_flow(flow_id, body.get("env_id"),
                        body.get("inputs") or {},
                        ran_by=body.get("ran_by"))
    return _safe(go)


@router.get("/guided/tiles")
def guided_tiles(system: str | None = None):
    """Published business flows; runnable iff bindings exist."""
    def go():
        conn, cur = _cur()
        clause, p = _pclause(system, "f.project_id")
        cur.execute(f"""SELECT f.flow_id,
                               NVL(f.business_name, f.generated_name) name,
                               f.goal, f.domain, f.origin,
                               b.tile_icon, b.inputs_json,
                               CASE WHEN b.flow_id IS NULL THEN 'N'
                                    ELSE 'Y' END runnable
                        FROM api_business_flows f
                        LEFT JOIN api_flow_bindings b
                               ON b.flow_id = f.flow_id
                        WHERE {clause} AND f.is_published = 'Y'
                        ORDER BY runnable DESC, f.domain, name""", p)
        import json as _j
        tiles = []
        for r in _rows(cur):
            if r.get("inputs_json"):
                v = r.pop("inputs_json")
                try:
                    r["inputs"] = _j.loads(v.read() if hasattr(v, "read")
                                           else v)
                except Exception:                            # noqa: BLE001
                    r["inputs"] = []
            else:
                r.pop("inputs_json", None)
                r["inputs"] = []
            tiles.append(r)
        return {"tiles": tiles}
    return _safe(go)
