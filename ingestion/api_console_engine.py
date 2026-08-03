"""
api_console_engine.py — API 360 Console engine.

Capabilities:
  * environment variable resolution (PLAIN / SECRET via env:/enc: refs /
    MANAGED OAuth2 client-credentials token with cache)
  * request execution with {{var}} templating in URL, params, headers, body
  * PII masking of response JSON driven by legacy_dictionary IS_PII names
  * schema validation of responses against stored OpenAPI contracts
  * tests mini-DSL:  status == 200 | time < 2000 | body.a.b exists |
                     body.a.b isNumber | body.a.b == VALUE
  * collections: auto-generate from contract, Postman v2.1 import/export
  * flows: BA-composed multi-step services with {{input.x}}, {{stepN.y}},
    {{each.<list>}} fan-out, extraction, and table/summary presentation
Everything is evidence-logged to api_history / api_flow_runs.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import re
import time
import uuid

from ingestion.variance_engine import _catalog
from ingestion.datasource_registry import _resolve_secret

log = logging.getLogger("cp.api360.console")

try:
    import requests as _rq
except ImportError:                                         # pragma: no cover
    _rq = None

_TOKEN_CACHE: dict[str, tuple[str, float]] = {}


def _id(prefix):
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def _cur():
    conn = _catalog()
    return conn, conn.cursor()


def _rows(cur):
    cols = [c[0].lower() for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _clob(v):
    return v.read() if hasattr(v, "read") else v


# ---------------------------------------------------------------------------
# environments
# ---------------------------------------------------------------------------
def env_vars(env_id, resolve_secrets=False):
    _c, cur = _cur()
    cur.execute("""SELECT var_name, var_value, var_kind FROM api_env_vars
                   WHERE env_id = :e""", {"e": env_id})
    out = {}
    for name, val, kind in cur.fetchall():
        if kind == "SECRET":
            out[name] = (_resolve_secret(val) if resolve_secrets
                         else "\u25cf\u25cf\u25cf\u25cf\u25cf\u25cf")
        else:
            out[name] = val
    return out


def _oauth_token(env_id, v):
    """MANAGED token: client-credentials against {{tokenUrl}}."""
    key = env_id
    tok = _TOKEN_CACHE.get(key)
    if tok and tok[1] > time.time() + 30:
        return tok[0]
    if not _rq:
        raise RuntimeError("python 'requests' package required")
    r = _rq.post(v.get("tokenUrl", ""), data={
        "grant_type": "client_credentials",
        "client_id": v.get("clientId", ""),
        "client_secret": v.get("clientSecret", "")},
        timeout=30, verify=True)
    r.raise_for_status()
    j = r.json()
    _TOKEN_CACHE[key] = (j["access_token"],
                         time.time() + int(j.get("expires_in", 300)))
    return _TOKEN_CACHE[key][0]


def build_context(env_id):
    v = env_vars(env_id, resolve_secrets=True)
    # test-data convention: testAccountId fills {{accountId}} in unattended
    # runs when no explicit value is supplied; user input overrides.
    if "testAccountId" in v and "accountId" not in v:
        v["accountId"] = v["testAccountId"]
    if "tokenUrl" in v and "clientId" in v:
        try:
            v["token"] = _oauth_token(env_id, v)
        except Exception as e:                              # noqa: BLE001
            v["token"] = ""
            log.warning("token fetch failed: %s", str(e)[:120])
    return v


# ---------------------------------------------------------------------------
# templating + dotted lookup
# ---------------------------------------------------------------------------
def _lookup(ctx, path):
    cur = ctx
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit():
            cur = cur[int(part)] if int(part) < len(cur) else None
        else:
            return None
        if cur is None:
            return None
    return cur


def render(tmpl, ctx):
    if tmpl is None:
        return None
    def sub(m):
        v = _lookup(ctx, m.group(1).strip())
        return "" if v is None else str(v)
    return re.sub(r"\{\{([^}]+)\}\}", sub, str(tmpl))


def extract(obj, path):
    """Dotted path with [] fan-out: 'accounts[].accountId' -> list."""
    if "[]" in path:
        head, _, tail = path.partition("[]")
        base = _lookup({"_": obj}, ("_." + head).strip(".").replace("..", "."))
        base = _lookup(obj if isinstance(obj, dict) else {}, head.strip(".")) \
            if base is None else base
        if not isinstance(base, list):
            return []
        tail = tail.lstrip(".")
        return [extract(item, tail) if tail else item for item in base]
    return _lookup(obj, path) if path else obj


# ---------------------------------------------------------------------------
# PII masking
# ---------------------------------------------------------------------------
_PII_NAMES = None


def _norm(name):
    return re.sub(r"[^A-Z0-9]", "", str(name).upper())


def _pii_names():
    global _PII_NAMES
    if _PII_NAMES is None:
        try:
            _c, cur = _cur()
            cur.execute("""SELECT NVL(pb_field_mapping, field_code_norm)
                           FROM legacy_dictionary
                           WHERE UPPER(NVL(is_pii,'N')) = 'Y'""")
            _PII_NAMES = {_norm(r[0]) for r in cur.fetchall() if r[0]}
        except Exception:                                   # noqa: BLE001
            _PII_NAMES = set()
        # sensible built-ins even without a dictionary hit
        _PII_NAMES |= {"ACCOUNTNAME", "CLIENTNAME", "SSN", "TAXID",
                       "DATEOFBIRTH", "EMAIL", "PHONE", "ADDRESS"}
    return _PII_NAMES


def _maskv(v):
    return "".join("A" if c.isalpha() else "9" if c.isdigit() else c
                   for c in str(v))


def mask_pii(obj):
    names = _pii_names()
    if isinstance(obj, dict):
        return {k: (_maskv(v) if _norm(k) in names
                    and isinstance(v, (str, int, float))
                    else mask_pii(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [mask_pii(x) for x in obj]
    return obj


# ---------------------------------------------------------------------------
# schema validation vs contract
# ---------------------------------------------------------------------------


_TYPES = {"string": str, "integer": (int,), "number": (int, float),
          "boolean": bool, "array": list, "object": dict}





# ---------------------------------------------------------------------------
# tests DSL
# ---------------------------------------------------------------------------
def run_tests(tests, status, elapsed_ms, body):
    results = []
    for t in tests or []:
        t = t.strip()
        ok, why = False, ""
        try:
            m = re.match(r"status\s*==\s*(\d+)", t)
            if m:
                ok = status == int(m.group(1))
            elif (m := re.match(r"time\s*<\s*(\d+)", t)):
                ok = elapsed_ms < int(m.group(1))
            elif (m := re.match(r"(body[\w.\[\]]*)\s+exists", t)):
                ok = extract(body, m.group(1)[5:]) is not None
            elif (m := re.match(r"(body[\w.\[\]]*)\s+isNumber", t)):
                v = extract(body, m.group(1)[5:])
                vs = v if isinstance(v, list) else [v]
                ok = all(isinstance(x, (int, float)) for x in vs if x
                         is not None) and any(x is not None for x in vs)
            elif (m := re.match(r"(body[\w.\[\]]*)\s*==\s*(.+)", t)):
                ok = str(extract(body, m.group(1)[5:])) == m.group(2).strip()
            else:
                why = "unrecognised test"
        except Exception as e:                              # noqa: BLE001
            why = str(e)[:60]
        results.append({"test": t, "ok": bool(ok), "note": why})
    return results


# ---------------------------------------------------------------------------
# request execution
# ---------------------------------------------------------------------------
def execute(env_id, method, url_tmpl, params=None, headers=None,
            body_tmpl=None, tests=None, req_id=None, extra_ctx=None,
            ran_by=None):
    if not _rq:
        return {"error": "python 'requests' package not installed"}
    ctx = build_context(env_id)
    if extra_ctx:
        ctx = {**ctx, **extra_ctx}
    url = render(url_tmpl, ctx)
    p = {k: render(v, ctx) for k, v in (params or {}).items()}
    h = {k: render(v, ctx) for k, v in (headers or {}).items()}
    if ctx.get("token") and "Authorization" not in h:
        h["Authorization"] = f"Bearer {ctx['token']}"
    body = render(body_tmpl, ctx) if body_tmpl else None
    t0 = time.time()
    try:
        r = _rq.request(method.upper(), url, params=p, headers=h,
                        data=(body.encode() if body else None), timeout=60)
        elapsed = int((time.time() - t0) * 1000)
        try:
            bj = r.json()
        except Exception:                                   # noqa: BLE001
            bj = None
        notes = (validate_from_fields(extra_ctx.get("_endpoint_key")
                 if extra_ctx else None, bj)
                 if bj is not None else [])
        schema_ok, contract = ((len(notes) == 0), None) if bj is not None \
            else (None, None)
        tres = run_tests(tests, r.status_code, elapsed, bj)
        masked = mask_pii(bj) if bj is not None else None
        _log_history(env_id, req_id, method, url, r.status_code, elapsed,
                     len(r.content or b""), schema_ok, tres, ran_by)
        return {"status": r.status_code, "elapsed_ms": elapsed,
                "bytes": len(r.content or b""),
                "body": masked if masked is not None else (r.text or "")[:4000],
                "schema_ok": schema_ok, "contract": contract,
                "schema_notes": notes[:8], "tests": tres,
                "raw_unmasked": None}       # never returned by design
    except Exception as e:                                  # noqa: BLE001
        elapsed = int((time.time() - t0) * 1000)
        _log_history(env_id, req_id, method, url, None, elapsed, 0,
                     None, [], ran_by)
        return {"error": str(e)[:300], "elapsed_ms": elapsed}


def _log_history(env_id, req_id, method, url, status, ms, nbytes,
                 schema_ok, tests, ran_by):
    try:
        conn, cur = _cur()
        cur.execute("""INSERT INTO api_history
            (hist_id, env_id, req_id, method, url_final, status_code,
             elapsed_ms, resp_bytes, schema_ok, tests_json, ran_by)
            VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11)""",
            [_id("H"), env_id, req_id, method, url[:1000], status, ms,
             nbytes, schema_ok, json.dumps(tests)[:4000], ran_by])
        conn.commit()
    except Exception:                                       # noqa: BLE001
        log.warning("history log failed")


# ---------------------------------------------------------------------------
# collections
# ---------------------------------------------------------------------------

def import_postman(pm: dict, shared="Y"):
    conn, cur = _cur()
    coll_id = _id("C")
    cur.execute("""INSERT INTO api_collections (coll_id, name, source, shared)
                   VALUES (:1, :2, 'POSTMAN', :3)""",
                [coll_id, (pm.get("info") or {}).get("name", "Imported"),
                 shared])
    n = 0

    def walk(items, folder):
        nonlocal n
        for it in items or []:
            if "item" in it:
                walk(it["item"], it.get("name", folder))
                continue
            rq = it.get("request") or {}
            url = rq.get("url")
            raw = url.get("raw") if isinstance(url, dict) else url
            cur.execute("""INSERT INTO api_requests
                (req_id, coll_id, folder, name, method, url_tmpl,
                 headers_json, body_tmpl, sort_order)
                VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9)""",
                [_id("R"), coll_id, folder, it.get("name"),
                 (rq.get("method") or "GET").upper(), raw,
                 json.dumps({h["key"]: h["value"]
                             for h in rq.get("header", [])}),
                 ((rq.get("body") or {}).get("raw")), n])
            n += 1
    walk(pm.get("item"), "General")
    conn.commit()
    return {"coll_id": coll_id, "requests": n}


def export_postman(coll_id):
    _c, cur = _cur()
    cur.execute("SELECT name FROM api_collections WHERE coll_id = :c",
                {"c": coll_id})
    row = cur.fetchone()
    cur.execute("""SELECT folder, name, method, url_tmpl, params_json,
                          headers_json, body_tmpl, tests_json
                   FROM api_requests WHERE coll_id = :c
                   ORDER BY folder, sort_order""", {"c": coll_id})
    folders = {}
    for folder, nm, method, url, pj, hj, body, _tj in cur.fetchall():
        params = json.loads(pj or "{}")
        q = "&".join(f"{k}={v}" for k, v in params.items())
        item = {"name": nm, "request": {
            "method": method,
            "header": [{"key": k, "value": v}
                       for k, v in json.loads(hj or "{}").items()],
            "url": {"raw": url + (("?" + q) if q else "")}}}
        if body:
            item["request"]["body"] = {"mode": "raw", "raw": _clob(body)}
        folders.setdefault(folder or "General", []).append(item)
    return {"info": {"name": row[0] if row else coll_id,
                     "schema": "https://schema.getpostman.com/json/"
                               "collection/v2.1.0/collection.json"},
            "item": [{"name": f, "item": items}
                     for f, items in folders.items()]}


def run_collection(coll_id, env_id):
    conn, cur = _cur()
    cur.execute("""SELECT req_id, name, method, url_tmpl, params_json,
                          headers_json, body_tmpl, tests_json
                   FROM api_requests WHERE coll_id = :c
                   ORDER BY sort_order""", {"c": coll_id})
    reqs = cur.fetchall()
    results, passed = [], 0
    for req_id, nm, method, url, pj, hj, body, tj in reqs:
        r = execute(env_id, method, url, json.loads(pj or "{}"),
                    json.loads(hj or "{}"), _clob(body) if body else None,
                    json.loads(tj or "[]"), req_id=req_id)
        ok = (not r.get("error") and r.get("status", 0) < 400
              and r.get("schema_ok") != "N"
              and all(t["ok"] for t in r.get("tests", [])))
        passed += 1 if ok else 0
        results.append({"name": nm, "ok": ok,
                        "status": r.get("status"),
                        "elapsed_ms": r.get("elapsed_ms"),
                        "schema_ok": r.get("schema_ok"),
                        "error": r.get("error"),
                        "notes": r.get("schema_notes", [])[:3]})
    crid = _id("CR")
    cur.execute("""INSERT INTO api_coll_runs
        (collrun_id, coll_id, env_id, status, total_reqs, passed,
         results_json) VALUES (:1,:2,:3,:4,:5,:6,:7)""",
        [crid, coll_id, env_id,
         "COMPLETE" if passed == len(reqs) else "FAILED",
         len(reqs), passed, json.dumps(results)])
    conn.commit()
    return {"collrun_id": crid, "total": len(reqs), "passed": passed,
            "results": results}


# ---------------------------------------------------------------------------
# flows (BA-built services)
# ---------------------------------------------------------------------------
FOREACH_CAP = 50



def _resolve_step_request(cur, st):
    if st.get("req_id"):
        cur.execute("""SELECT method, url_tmpl, params_json, headers_json
                       FROM api_requests WHERE req_id = :r""",
                    {"r": st["req_id"]})
        row = cur.fetchone()
        if row:
            return {"method": row[0], "url": row[1],
                    "params": json.loads(row[2] or "{}"),
                    "headers": json.loads(row[3] or "{}"),
                    "req_id": st["req_id"]}
    return {"method": st.get("method", "GET"), "url": st.get("url", ""),
            "params": st.get("params") or {}, "headers": {}}


_DECODES = {}


def _decode_set(name):
    if name not in _DECODES:
        try:
            _c, cur = _cur()
            cur.execute("""SELECT code, meaning FROM api_code_decodes
                           WHERE decode_set = :s""", {"s": name})
            _DECODES[name] = {str(c): m for c, m in cur.fetchall()}
        except Exception:                                   # noqa: BLE001
            _DECODES[name] = {}
    return _DECODES[name]


def _present(spec, ctx):
    cols = spec.get("columns") or []
    rows = []
    if spec.get("zip"):                       # zip lists into rows
        lists = [ctx.get(c["key"]) or [] for c in cols]
        n = max((len(x) for x in lists if isinstance(x, list)), default=0)
        for i in range(n):
            row = {}
            for j, c in enumerate(cols):
                v = (lists[j][i] if isinstance(lists[j], list)
                     and i < len(lists[j]) else None)
                if c.get("lookup"):
                    dec = _decode_set(c["lookup"])
                    v = dec.get(str(v), v)
                row[c["label"]] = v
            rows.append(row)
    summary = render(spec.get("summary", ""), ctx)
    return {"type": spec.get("type", "table"), "columns":
            [c["label"] for c in cols], "rows": rows[:500],
            "summary": summary}


# ===================== consolidation: catalog-backed validation ==============
def validate_from_fields(endpoint_key, resp_json):
    """Validate a response against api_fields (required/type/max_length) —
    the curated catalog truth. Returns list of issue strings (empty = pass)."""
    issues = []
    if not endpoint_key:
        return []
    try:
        _c, cur = _cur()
        cur.execute("""SELECT field_name, data_type, required, max_length
                       FROM api_fields WHERE endpoint_key = :k""",
                    {"k": endpoint_key})
        rows = cur.fetchall()
    except Exception:                                        # noqa: BLE001
        return []
    if not rows or not isinstance(resp_json, (dict, list)):
        return []
    sample = resp_json[0] if isinstance(resp_json, list) and resp_json \
        else resp_json
    if not isinstance(sample, dict):
        return []
    types_ok = _TYPES
    for fname, dtype, req, maxlen in rows:
        v = sample.get(fname)
        if v is None:
            if req == "Y":
                issues.append(f"required field missing: {fname}")
            continue
        exp = types_ok.get((dtype or "").lower())
        if exp and not isinstance(v, exp):
            issues.append(f"{fname}: expected {dtype}, got "
                          f"{type(v).__name__}")
        if maxlen and isinstance(v, str) and len(v) > int(maxlen):
            issues.append(f"{fname}: length {len(v)} > max {maxlen}")
    return issues[:50]


def _load_business_flow(flow_id):
    """Unified flow: api_business_flows + steps (endpoint join) + bindings."""
    _c, cur = _cur()
    cur.execute("""SELECT flow_id, NVL(business_name, generated_name),
                          goal, is_published
                   FROM api_business_flows WHERE flow_id = :f""",
                {"f": flow_id})
    h = cur.fetchone()
    if not h:
        raise ValueError(f"unknown flow {flow_id}")
    cur.execute("""SELECT b.inputs_json, b.present_json
                   FROM api_flow_bindings b WHERE b.flow_id = :f""",
                {"f": flow_id})
    fb = cur.fetchone()
    inputs = json.loads(fb[0].read() if hasattr(fb[0], "read") else fb[0]) \
        if fb and fb[0] else []
    present = json.loads(fb[1].read() if hasattr(fb[1], "read") else fb[1]) \
        if fb and fb[1] else None
    cur.execute("""SELECT s.step_order, s.endpoint_key,
                          e.method, e.path, e.server_url,
                          sb.params_json, sb.body_json, sb.extract_json,
                          sb.foreach
                   FROM api_business_flow_steps s
                   LEFT JOIN api_endpoints e
                          ON e.endpoint_key = s.endpoint_key
                   LEFT JOIN api_flow_step_bindings sb
                          ON sb.flow_id = s.flow_id
                         AND sb.step_order = s.step_order
                   WHERE s.flow_id = :f ORDER BY s.step_order""",
                {"f": flow_id})
    steps = []
    for so, ek, method, path, server, pj, bj, xj, fe in cur.fetchall():
        def _j(x):
            if not x:
                return None
            t = x.read() if hasattr(x, "read") else x
            return json.loads(t) if t else None
        steps.append({"step_order": so, "endpoint_key": ek,
                      "method": method or "GET", "path": path or "",
                      "params": _j(pj) or {}, "body": _j(bj),
                      "extract": _j(xj) or {}, "foreach": fe})
    return {"flow_id": h[0], "name": h[1], "goal": h[2],
            "published": h[3] == "Y", "inputs": inputs,
            "present": present, "steps": steps,
            "runnable": bool(fb)}


def run_flow(flow_id, env_id, user_inputs=None, ran_by=None):
    """Execute a bound business flow (api_business_flows + bindings).
    {{input.x}} from user_inputs; {{var}} from earlier extracts;
    {{each.*}} fan-out capped at FOREACH_CAP."""
    flow = _load_business_flow(flow_id)
    if not flow["runnable"]:
        return {"error": "flow has no runtime bindings — docs-only"}
    extra = {}
    for k, v in (user_inputs or {}).items():
        extra[f"input.{k}"] = v
        extra.setdefault(k, v)
    report = {"flow_id": flow_id, "name": flow["name"], "steps": []}
    ctx_vars = dict(extra)
    for st in flow["steps"]:
        fe = st.get("foreach")
        iterations = [None]
        if fe:
            key = fe.replace("{{each.", "").replace("{{", "") \
                    .replace("}}", "").replace("each.", "").strip()
            lst = ctx_vars.get(key)
            if isinstance(lst, list):
                iterations = lst[:FOREACH_CAP]
            elif lst is not None:
                iterations = [lst]
        srep = {"step_order": st["step_order"],
                "endpoint_key": st["endpoint_key"], "count": 0, "ok": 0}
        collected = {}
        for item in iterations:
            local = dict(ctx_vars)
            local["_endpoint_key"] = st["endpoint_key"]
            if item is not None:
                local["each"] = item
                if isinstance(item, dict):
                    for kk, vv in item.items():
                        local[f"each.{kk}"] = vv
            url_t = st.get("path") or ""
            if url_t and not url_t.startswith("http"):
                url_t = "{{baseUrl}}" + ("" if url_t.startswith("/") else "/") \
                        + url_t
            body_t = json.dumps(st["body"]) if isinstance(
                st.get("body"), (dict, list)) else st.get("body")
            res = execute(env_id, st["method"], url_t,
                          params=st.get("params") or {},
                          body_tmpl=body_t, extra_ctx=local, ran_by=ran_by)
            srep["count"] += 1
            if not res.get("error") and (res.get("status") or 999) < 400:
                srep["ok"] += 1
            body = res.get("body")
            for var, path_expr in (st.get("extract") or {}).items():
                if path_expr.startswith("json."):     # tolerate old convention
                    path_expr = path_expr[5:]
                val = extract(body, path_expr)
                if fe:  # fan-out: accumulate lists across iterations
                    collected.setdefault(var, [])
                    if isinstance(val, list):
                        collected[var].extend(val)
                    elif val is not None:
                        collected[var].append(val)
                else:
                    ctx_vars[var] = val
        for var, vals in collected.items():
            ctx_vars[var] = vals
        srep["last_status"] = res.get("status") if iterations else None
        report["steps"].append(srep)
    if flow.get("present"):
        try:
            report["presented"] = _present(flow["present"], ctx_vars)
        except Exception as ex:                             # noqa: BLE001
            report["present_error"] = str(ex)[:200]
    report["ok"] = all(s["ok"] == s["count"] for s in report["steps"])
    try:                                   # evidence log (best-effort)
        conn2, cur2 = _cur()
        cur2.execute("""INSERT INTO api_flow_runs
            (flowrun_id, flow_id, env_id, status, steps_json, ran_by)
            VALUES (:1,:2,:3,:4,:5,:6)""",
            [_id("FR"), flow_id, env_id,
             "PASS" if report["ok"] else "FAIL",
             json.dumps(report["steps"])[:3900], ran_by])
        conn2.commit()
    except Exception:                                       # noqa: BLE001
        log.warning("flow run log failed")
    return report
