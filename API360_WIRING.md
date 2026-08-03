# API 360 Console · Consolidation Wiring Guide

One catalog (your Api360Connector tables), one pipeline (the connector over
the artifacts tree), two consumers (API 360 design-time · Console runtime).

## Deploy order — follow exactly

### 1. SQL (SILVER, as A041327)
Run `sql/37_api360_consolidation.sql`.
Creates: `api_spec_versions`, `api_flow_bindings`, `api_flow_step_bindings`.
Alters: `api_sources` (+drift_status/note/ack), `api_requests`
(+endpoint_key). Idempotent. **The DROP block at the bottom stays commented
out — step 7.**

### 2. Ingestion (deploy to ingestion/)
- `api_spec_versioning.py` — NEW. Snapshot + field-diff + drift.
- `api360_conn.py` — YOUR connector with exactly 3 grafted insertions
  (review `CONNECTOR_DIFF.md`, 50 lines; your original is preserved as
  `api360_conn.py.orig`; stripping the grafts reproduces it byte-for-byte).
- `api_catalog_ingest.py` — NEW. `scan` / `scan --file` / `place` CLI.
- **DELETE** `api_contract_ingest.py` — the parallel pipeline is retired.
- `api_console_engine.py` — REPLACED. Contract validation is gone;
  responses now validate against `api_fields` (the curated catalog);
  `run_flow` executes `api_business_flows` + bindings.
- `api_console_runner.py` — unchanged from the last drop.

### 3. Router
Deploy `routers_api360_console.py` (34 endpoints, zero references to the
dropped tables). Ensure your `main.py` mount tuple includes
`routers_api360_console` — and while you're in there,
`routers_recon360` + `routers_admin_datasources` (still missing per the
/api/admin/datasources 404).

### 4. UI (impacted files only)
`Api360Console.jsx`, `api.js`, `mockData.js`. Everything else untouched.

### 5. Apply the patches to YOUR files
See `API360_PATCH_NOTES.md` — three small changes: `/bf/api-flows` project
filter in main.py, the Non-SEI toggle fix in your `Api360.jsx`, and the
api.js forwarding line. These fix the SEI-leak-under-Non-SEI bug we
confirmed by screenshot.

### 6. Verify before dropping anything
1. `/apicon/catalog/systems` → sei with 197 sources.
2. Upload a spec through Catalog Admin → file lands in the tree →
   `api_spec_versions` gets v1 → source shows CURRENT.
3. Re-upload with a field made required → v2, BREAKING, source shows
   DRIFT with the note → Acknowledge clears the worklist.
4. Collection Builder picker shows real `api_endpoints` rows; typeahead
   works; create a collection; run it; validation notes reference
   `api_fields` names.
5. Flow Builder: open a generated flow → add bindings to one GET step →
   Save → ▶ Test returns a report → Publish → tile appears in Guided as
   runnable; an unbound published flow shows docs-only and won't run.
6. Your API 360 business-function detail screen (steps · produces/consumes
   · datapoints · batch equivalent) renders identically.

### 7. ONLY THEN: drops
Uncomment the block in `37_api360_consolidation.sql` and run it —
`api_contracts`, `api_systems`, `api_ingest_sources`. These have no
remaining readers. **Never** drop `api_flows` / `api_flow_steps` — those
are the connector's Postman-derived catalog tables.

## Scheduled scan (unchanged pattern)
`api_console_runner.py --tag daily --env SEI_QA --fail-nonzero` for
collections; add a nightly `python -m ingestion.api_catalog_ingest scan`
if you want drift detection without waiting for uploads. The CronJob YAML
from the previous drop still applies to the runner.

## What was deliberately deferred
- A dedicated origin='console' create form for brand-new flows (current
  build binds existing flows; creating flows stays in API 360 with BAs).
- Non-SEI environments beyond baseUrl/OAuth2 presets.
