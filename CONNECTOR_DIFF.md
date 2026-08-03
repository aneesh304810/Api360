--- ingestion/api360_conn.py.orig	2026-08-03 19:43:55.378004240 +0000
+++ ingestion/api360_conn.py	2026-08-03 19:43:55.391211450 +0000
@@ -69,6 +69,7 @@
     # ---- parse -------------------------------------------------------
     def parse(self) -> dict[str, Any]:
         sources, endpoints, fields, errors = [], [], [], []
+        self._raw_specs = {}   # source_id -> (release_version, raw_text)
         flows, flow_steps, deps = [], [], []
         # global entity maps across ALL collections, for flow generation
         produces_map: dict[str, list] = {}
@@ -124,6 +125,7 @@
             log.warning("api360: flow generation failed: %s", e)
 
         return {"sources": sources, "endpoints": endpoints, "fields": fields,
+                "raw_specs": getattr(self, "_raw_specs", {}),
                 "errors": errors, "flows": flows, "flow_steps": flow_steps,
                 "dependencies": uniq_deps,
                 "business_flows": business_flows,
@@ -141,6 +143,12 @@
         server_url = servers[0].get("url") if servers else spec.get("host", "")
         paths = spec.get("paths", {})
 
+        try:      # versioning graft: retain raw text for snapshot/diff
+            self._raw_specs[source_id] = (
+                str(info.get("version", "")), path.read_text(
+                    encoding="utf-8", errors="replace"))
+        except Exception:                                   # noqa: BLE001
+            pass
         sources.append({
             "source_id": source_id,
             "display_name": info.get("title", source_id),
@@ -388,6 +396,18 @@
 
     # ---- load --------------------------------------------------------
     def load(self, loader, bundle: dict[str, Any]) -> None:
+        # ---- versioning graft: snapshot + diff + drift (best-effort) ----
+        try:
+            from .api_spec_versioning import snapshot_and_diff
+            conn = (getattr(loader, "conn", None)
+                    or getattr(loader, "_conn", None)
+                    or getattr(loader, "connection", None))
+            if conn:
+                for sid, (rv, raw) in (bundle.get("raw_specs") or {}).items():
+                    snapshot_and_diff(conn, sid, rv, raw,
+                                      bundle["endpoints"], bundle["fields"])
+        except Exception as _e:                             # noqa: BLE001
+            log.warning("api360 versioning skipped: %s", _e)
         for s in bundle["sources"]:
             loader._merge("api_sources", ("source_id",), s, protect=("display_name",))
         for e in bundle["endpoints"]:
