"""
API 360 connector — parses OpenAPI/Swagger specs (organized by domain folder)
and Postman collections, writing:
  - api_sources       (one per spec file)
  - api_endpoints     (per path+method)
  - api_fields        (request body / parameter fields)
  - api_endpoint_errors (from responses + Markdown error tables in descriptions)
  - api_flows / api_flow_steps (from Postman collection request order)

Folder layout expected under <CP_CATALOG_ROOT>/API-SPEC/:
    API-SPEC/<domain>/swagger-spec-<Name>.yaml      (or .json)
    POSTMAN/<collection>.postman_collection.json    (optional)

Project: anything under API-SPEC/ -> 'sei' (per ProjectResolver); NON-SEI/ -> internal.
Pure parsing; writes only via loader._merge.
"""
from __future__ import annotations
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

from .base import BaseConnector
from .project_resolver import ProjectResolver

log = logging.getLogger(__name__)

# Function point id pattern in info.description: "Function point Id is 491."
_FPID = re.compile(r"function\s*point\s*id\s*is\s*(\d+)", re.I)
# Markdown error table rows: | 1 | Invalid Account | ERR-AO-001 | detail |
_ERR_ROW = re.compile(r"^\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$")


def _load(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() in (".yaml", ".yml"):
        import yaml
        # YAML forbids tabs for indentation; some hand-edited specs use them.
        # Convert leading tabs to 2 spaces each so these files still parse.
        fixed = "\n".join(
            re.sub(r"^\t+", lambda m: "  " * len(m.group()), line)
            for line in text.splitlines())
        try:
            return yaml.safe_load(fixed)
        except yaml.YAMLError:
            # last resort: replace ALL tabs, not just leading
            return yaml.safe_load(fixed.replace("\t", "  "))
    return json.loads(text)


class Api360Connector(BaseConnector):
    def __init__(self, api_spec_root: str, resolver: ProjectResolver,
                 postman_root: Optional[str] = None):
        self.api_spec_root = api_spec_root
        self.postman_root = postman_root
        self.resolver = resolver

    @classmethod
    def from_env(cls) -> "Api360Connector":
        root = os.environ["CP_CATALOG_ROOT"]
        return cls(
            api_spec_root=os.getenv("API_SPEC_ROOT", os.path.join(root, "API-SPEC")),
            postman_root=os.getenv("POSTMAN_ROOT", os.path.join(root, "POSTMAN")),
            resolver=ProjectResolver.from_env(),
        )

    # ---- parse -------------------------------------------------------
    def parse(self) -> dict[str, Any]:
        sources, endpoints, fields, errors = [], [], [], []
        flows, flow_steps, deps = [], [], []
        # global entity maps across ALL collections, for flow generation
        produces_map: dict[str, list] = {}
        consumes_map: dict[str, list] = {}

        spec_root = Path(self.api_spec_root)
        if spec_root.exists():
            for spec_path in sorted(spec_root.rglob("*")):
                if spec_path.suffix.lower() not in (".yaml", ".yml", ".json"):
                    continue
                if "postman" in spec_path.name.lower():
                    continue
                try:
                    self._parse_spec(spec_path, sources, endpoints, fields, errors)
                except Exception as e:
                    log.warning("api360: failed to parse %s: %s", spec_path.name, e)

        pm_root = Path(self.postman_root) if self.postman_root else None
        if pm_root and pm_root.exists():
            # accept *.postman_collection.json (Postman export default) and
            # *.postman.json (common shortened convention). Skip helper files
            # like _catalog_metadata.json and anything starting with '_'.
            seen = set()
            for pat in ("*.postman_collection.json", "*.postman.json"):
                for pm_path in sorted(pm_root.rglob(pat)):
                    if pm_path.name.startswith("_") or pm_path in seen:
                        continue
                    seen.add(pm_path)
                    try:
                        self._parse_postman(pm_path, flows, flow_steps, deps,
                                            endpoints, produces_map, consumes_map)
                    except Exception as e:
                        log.warning("api360: failed to parse postman %s: %s",
                                    pm_path.name, e)

        log.info("api360: %d sources, %d endpoints, %d fields, %d errors, %d flows",
                 len(sources), len(endpoints), len(fields), len(errors), len(flows))
        # dedupe dependency edges
        seen_d = set(); uniq_deps = []
        for d in deps:
            k = (d["from_endpoint"], d["to_endpoint"])
            if k not in seen_d:
                seen_d.add(k); uniq_deps.append(d)
        log.info("api360: %d dependency edges", len(uniq_deps))

        # ---- generate business flows from the global dependency maps ----
        business_flows, business_steps = [], []
        try:
            from .api_flow_generator import generate_flows
            business_flows, business_steps = generate_flows(
                endpoints, uniq_deps, produces_map, consumes_map)
        except Exception as e:
            log.warning("api360: flow generation failed: %s", e)

        return {"sources": sources, "endpoints": endpoints, "fields": fields,
                "errors": errors, "flows": flows, "flow_steps": flow_steps,
                "dependencies": uniq_deps,
                "business_flows": business_flows,
                "business_steps": business_steps}

    def _parse_spec(self, path: Path, sources, endpoints, fields, errors) -> None:
        spec = _load(path)
        if not isinstance(spec, dict):
            return
        info = spec.get("info", {})
        project_id = self.resolver.resolve_for_api_spec(path)
        feature_group = path.parent.name      # the domain folder
        source_id = path.stem.replace("swagger-spec-", "")
        servers = spec.get("servers") or []
        server_url = servers[0].get("url") if servers else spec.get("host", "")
        paths = spec.get("paths", {})

        sources.append({
            "source_id": source_id,
            "display_name": info.get("title", source_id),
            "project_id": project_id,
            "feature_group": feature_group,
            "kind": "OpenAPI" if str(spec.get("openapi", "")).startswith("3") else "Swagger2",
            "release_version": str(info.get("version", "")),
            "spec_path": str(path),
            "endpoint_count": sum(len([m for m in v if m.lower() in
                ("get", "post", "put", "delete", "patch")]) for v in paths.values()),
        })

        # function point id from description
        desc = info.get("description", "") or ""
        fpid_m = _FPID.search(desc)
        fpid = fpid_m.group(1) if fpid_m else None

        for path_str, ops in paths.items():
            for method, op in (ops or {}).items():
                if method.lower() not in ("get", "post", "put", "delete", "patch"):
                    continue
                ep_key = f"{source_id}:{method.upper()} {path_str}"
                op = op or {}
                op_desc = op.get("description", "") or ""
                endpoints.append({
                    "endpoint_key": ep_key, "source_id": source_id,
                    "method": method.upper(), "path": path_str,
                    "operation_id": op.get("operationId"),
                    "summary": op.get("summary"),
                    "description": op_desc,
                    "function_point_id": fpid,
                    "full_endpoint_url": (server_url or "") + path_str,
                    "sei_version": str(info.get("version", "")),
                    "server_url": server_url,
                    "error_count": 0, "requires_auth": "Y",
                    "project_id": project_id, "feature_group": feature_group,
                })
                # request body fields (OpenAPI 3 + swagger 2 parameters)
                self._extract_fields(ep_key, op, fields)
                # errors: from responses + markdown table in description
                self._extract_errors(ep_key, op, op_desc + "\n" + desc, errors)

    def _extract_fields(self, ep_key, op, fields) -> None:
        # OpenAPI 3 requestBody
        rb = (op.get("requestBody") or {}).get("content", {})
        for _, media in rb.items():
            schema = media.get("schema", {})
            for fname, fmeta in (schema.get("properties") or {}).items():
                fields.append({
                    "endpoint_key": ep_key, "field_name": fname,
                    "data_type": fmeta.get("type"),
                    "required": "Y" if fname in (schema.get("required") or []) else "N",
                    "max_length": fmeta.get("maxLength"),
                    "format": fmeta.get("format"),
                    "example_value": str(fmeta.get("example"))[:512] if fmeta.get("example") is not None else None,
                    "description": fmeta.get("description"),
                })
        # swagger 2 / path parameters
        for p in (op.get("parameters") or []):
            if "schema" in p and isinstance(p["schema"], dict) and p["schema"].get("properties"):
                for fname, fmeta in p["schema"]["properties"].items():
                    fields.append({
                        "endpoint_key": ep_key, "field_name": fname,
                        "data_type": fmeta.get("type"), "required": "N",
                        "description": fmeta.get("description"),
                    })
            else:
                fields.append({
                    "endpoint_key": ep_key, "field_name": p.get("name", "?"),
                    "data_type": p.get("type") or (p.get("schema") or {}).get("type"),
                    "required": "Y" if p.get("required") else "N",
                    "description": p.get("description"),
                })

    def _extract_errors(self, ep_key, op, desc_text, errors) -> None:
        seq = 0
        # HTTP responses (non-2xx)
        for status, resp in (op.get("responses") or {}).items():
            if str(status).startswith(("4", "5")):
                seq += 1
                errors.append({
                    "endpoint_key": ep_key, "http_status": str(status),
                    "error_code": f"HTTP_{status}", "sequence_no": seq,
                    "business_exception": (resp or {}).get("description"),
                    "error_details": (resp or {}).get("description"),
                })
        # Markdown error table in the description
        for line in desc_text.splitlines():
            m = _ERR_ROW.match(line)
            if m and m.group(3).strip().upper() not in ("ERROR CODE", "----"):
                seq += 1
                errors.append({
                    "endpoint_key": ep_key, "http_status": "400",
                    "error_code": m.group(3).strip(), "sequence_no": seq,
                    "business_exception": m.group(2).strip(),
                    "error_details": m.group(4).strip(),
                })

    def _parse_postman(self, path: Path, flows, flow_steps, deps=None,
                       endpoints=None, produces_map=None, consumes_map=None) -> None:
        coll = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        info = coll.get("info", {})
        flow_key = info.get("name", path.stem)
        project_id = self.resolver.resolve_for_api_spec(path)
        # source_domain from x-cp-catalog block if present
        cpcat = coll.get("x-cp-catalog", {}) or {}
        coll_domain = cpcat.get("source_domain")

        def walk(items, acc):
            for it in items:
                if "item" in it:           # folder
                    walk(it["item"], acc)
                elif "request" in it:
                    acc.append(it)
            return acc

        requests = walk(coll.get("item", []), [])
        flows.append({
            "flow_key": flow_key[:256], "flow_name": flow_key[:256],
            "project_id": project_id,
            "description": (info.get("description") or "")[:2000],
            "step_count": len(requests),
        })

        # Two dependency mechanisms, tried in order of richness:
        #  (a) rich spec: **Depends on:** (consumes) + test "var keys" (produces)
        #  (b) fallback:  {{var}} in URL consumed, .set('var') produced
        producer_of = {}       # entity name -> endpoint_key that produces it
        consumers = []         # (endpoint_key, [consumed entity names])

        for i, req in enumerate(requests, start=1):
            r = req.get("request", {})
            method = r.get("method", "GET")
            url = r.get("url", {})
            raw = url.get("raw") if isinstance(url, dict) else url
            desc = r.get("description", "") or ""

            # ---- resolve the real endpoint key ----
            # prefer the x-cp-source / **Path:** metadata over the raw {{base}} url
            real_path, real_method, op_id = self._endpoint_meta(desc)
            ep_method = real_method or method
            ep_path = real_path or raw or ""
            endpoint_key = f"{ep_method} {ep_path}"[:520]

            # contribute a lightweight endpoint record (from Postman) so the flow
            # generator can resolve endpoint_key -> metadata even when there is no
            # matching Swagger spec.
            if endpoints is not None:
                if not any(e.get("endpoint_key") == endpoint_key for e in endpoints):
                    endpoints.append({
                        "endpoint_key": endpoint_key,
                        "source_id": coll_domain or flow_key,
                        "method": ep_method, "path": ep_path,
                        "operation_id": op_id,
                        "summary": (req.get("name") or "")[:1000],
                        "description": desc[:2000],
                        "function_point_id": None,
                        "full_endpoint_url": ep_path, "sei_version": None,
                        "server_url": None, "error_count": 0, "requires_auth": "Y",
                        "project_id": project_id, "feature_group": coll_domain,
                    })

            # ---- consumes: **Depends on:** (rich) ----
            consumed = []
            m_dep = re.search(r"\*\*Depends on:\*\*\s*(.+)", desc)
            if m_dep:
                for tok in m_dep.group(1).split(","):
                    tok = tok.strip()
                    if tok and tok.lower() not in ("auth token", "access_token", "none"):
                        consumed.append(tok)
            # fallback: {{var}} placeholders in the raw url
            if not consumed and raw:
                consumed = [v for v in re.findall(r"\{\{([^}]+)\}\}", str(raw))
                            if v not in ("base_url", "baseUrl", "swp_token",
                                         "access_token", "AppKey", "AppSecret")]

            # ---- produces: test script "var keys = [...]" (rich) or .set() ----
            produced = []
            var_single = None
            for ev in req.get("event", []):
                src = "\n".join(ev.get("script", {}).get("exec", []) or [])
                m_keys = re.search(r"var\s+keys\s*=\s*\[([^\]]*)\]", src)
                if m_keys:
                    produced = [k.strip().strip("'\"")
                                for k in m_keys.group(1).split(",") if k.strip()]
                m_set = re.search(r"\.set\(['\"]([^'\"]+)['\"]", src)
                if m_set and not var_single:
                    var_single = m_set.group(1)
            if not produced and var_single:
                produced = [var_single]

            for ent in produced:
                producer_of.setdefault(ent, endpoint_key)
            if consumed:
                consumers.append((endpoint_key, consumed))
            # feed the global maps for cross-collection flow generation
            if produces_map is not None and produced:
                produces_map.setdefault(endpoint_key, [])
                for ent in produced:
                    if ent not in produces_map[endpoint_key]:
                        produces_map[endpoint_key].append(ent)
            if consumes_map is not None and consumed:
                consumes_map.setdefault(endpoint_key, [])
                for ent in consumed:
                    if ent not in consumes_map[endpoint_key]:
                        consumes_map[endpoint_key].append(ent)

            flow_steps.append({
                "flow_key": flow_key[:256], "step_order": i,
                "label": (req.get("name") or f"Step {i}")[:256],
                "endpoint_key": endpoint_key,
                "variable_passed": (produced[0] if produced else var_single or "")[:256] or None,
            })

        # ---- build dependency edges: consumer needs what a producer made ----
        if deps is not None:
            for consumer_key, consumed in consumers:
                for ent in consumed:
                    prod_key = producer_of.get(ent)
                    if prod_key and prod_key != consumer_key:
                        deps.append({
                            "from_endpoint": consumer_key[:520],
                            "to_endpoint": prod_key[:520],
                            "dep_type": "needs:" + ent[:30],
                        })

    @staticmethod
    def _endpoint_meta(desc: str):
        """Extract (path, method, opId) from a request description.
        Handles both **Path:**/**OperationId:** blocks and [x-cp-source ...] tags."""
        path = method = op = None
        m = re.search(r"\*\*Path:\*\*\s*(\w+)\s+(\S+)", desc)
        if m:
            method, path = m.group(1), m.group(2)
        m = re.search(r"\*\*OperationId:\*\*\s*(\S+)", desc)
        if m:
            op = m.group(1)
        # x-cp-source tag: [x-cp-source path=/accounts method=POST opId=foo]
        m = re.search(r"x-cp-source\s+path=(\S+)\s+method=(\w+)(?:\s+opId=(\S+?))?\]", desc)
        if m:
            path = path or m.group(1)
            method = method or m.group(2)
            op = op or m.group(3)
        return path, method, op

    # ---- load --------------------------------------------------------
    def load(self, loader, bundle: dict[str, Any]) -> None:
        for s in bundle["sources"]:
            loader._merge("api_sources", ("source_id",), s, protect=("display_name",))
        for e in bundle["endpoints"]:
            loader._merge("api_endpoints", ("endpoint_key",), e)
        for f in bundle["fields"]:
            loader._merge("api_fields", ("endpoint_key", "field_name"), f,
                          protect=("is_pii", "pii_category", "pii_attribute"))
        for er in bundle["errors"]:
            loader._merge("api_endpoint_errors",
                ("endpoint_key", "http_status", "error_code", "sequence_no"), er)
        for fl in bundle["flows"]:
            loader._merge("api_flows", ("flow_key",), fl)
        for st in bundle["flow_steps"]:
            loader._merge("api_flow_steps", ("flow_key", "step_order"), st)
        for d in bundle.get("dependencies", []):
            loader._merge("api_dependencies",
                          ("from_endpoint", "to_endpoint"), d)
        # generated business flows — NEVER overwrite BA curation
        for bf in bundle.get("business_flows", []):
            loader._merge("api_business_flows", ("flow_id",), bf,
                          protect=("business_name", "goal", "persona",
                                   "is_published", "origin"))
        for bs in bundle.get("business_steps", []):
            loader._merge("api_business_flow_steps",
                          ("flow_id", "step_order"), bs, protect=("note",))
        loader.commit()
