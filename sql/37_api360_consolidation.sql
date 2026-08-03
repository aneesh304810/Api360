-- ============================================================================
-- 37_api360_consolidation.sql  ·  ONE CATALOG, ONE PIPELINE, TWO CONSUMERS
-- Adds: spec version history + diff/drift on api_sources, runtime flow
-- bindings (sidecar to api_business_flows).  Idempotent.
-- The DROP block at the end is COMMENTED OUT — run it only after the rewire
-- is verified (see API360_WIRING.md sequencing).
-- ============================================================================

-- ---- raw spec snapshots (the only genuinely new storage) -------------------
BEGIN EXECUTE IMMEDIATE '
CREATE TABLE api_spec_versions (
      source_id     VARCHAR2(200),
      version_no    NUMBER,
      release_version VARCHAR2(60),
      content_hash  VARCHAR2(64),
      spec_clob     CLOB,
      ingested_at   TIMESTAMP DEFAULT SYSTIMESTAMP,
      diff_summary  CLOB,
      breaking_ct   NUMBER DEFAULT 0,
      additive_ct   NUMBER DEFAULT 0,
      CONSTRAINT pk_api_spec_versions PRIMARY KEY (source_id, version_no)
)'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;
/

-- ---- drift lives on the SOURCE row (api_sources = the catalog) -------------
BEGIN EXECUTE IMMEDIATE
  'ALTER TABLE api_sources ADD (drift_status VARCHAR2(12),
                                drift_note   VARCHAR2(1000),
                                drift_ack_by VARCHAR2(60),
                                drift_ack_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF; END;
/

-- ---- runtime bindings: sidecar to api_business_flows (NEVER alters them) ---
BEGIN EXECUTE IMMEDIATE '
CREATE TABLE api_flow_bindings (
      flow_id     VARCHAR2(160) PRIMARY KEY,
      inputs_json CLOB,          -- [{name,label,example,required}]
      present_json CLOB,         -- {type:table, columns:[{key,label,lookup}], summary}
      tile_icon   VARCHAR2(8),
      reviewed    CHAR(1) DEFAULT ''N'',
      updated_by  VARCHAR2(60),
      updated_at  TIMESTAMP DEFAULT SYSTIMESTAMP
)'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;
/
BEGIN EXECUTE IMMEDIATE '
CREATE TABLE api_flow_step_bindings (
      flow_id     VARCHAR2(160),
      step_order  NUMBER,
      params_json CLOB,          -- {{templated}} query/path params
      body_json   CLOB,          -- templated request body (POST/PUT/PATCH)
      extract_json CLOB,         -- {var: json.path[].with.fanout}
      foreach     VARCHAR2(200), -- {{each.someList}} fan-out driver
      CONSTRAINT pk_api_flow_step_bind PRIMARY KEY (flow_id, step_order)
)'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;
/

BEGIN EXECUTE IMMEDIATE
  'ALTER TABLE api_requests ADD (endpoint_key VARCHAR2(520))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF; END;
/

-- api_flow_runs.flow_id is VARCHAR2(40) but api_business_flows.flow_id is
-- VARCHAR2(120) — widen so business-flow runs can be evidence-logged:
BEGIN EXECUTE IMMEDIATE
  'ALTER TABLE api_flow_runs MODIFY (flow_id VARCHAR2(160))';
EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- api_flow_runs: re-key note — flow_id now references api_business_flows.
-- (column name unchanged; only its meaning narrows to the unified flow store)

-- ============================================================================
-- DROP BLOCK — my parallel-catalog tables. RUN LAST, after verification:
--   1) upload a spec via UI  2) drift fires on a breaking re-ingest
--   3) a bound flow runs end-to-end  4) collections read api_endpoints
-- Then uncomment and run:
-- ============================================================================
-- Guarded form (ignores ORA-00942 if a table was never created — e.g.
-- api_ingest_sources may not exist in your SILVER):
-- BEGIN
--   FOR t IN (SELECT table_name FROM user_tables
--             WHERE table_name IN ('API_CONTRACTS','API_SYSTEMS',
--                                  'API_INGEST_SOURCES')) LOOP
--     EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' PURGE';
--   END LOOP;
-- END;
-- /
-- Optional residue cleanup (columns, not tables — zero readers remain):
-- ALTER TABLE api_collections DROP COLUMN contract_id;
-- ============================================================================
-- NEVER DROP: api_flows / api_flow_steps  (Api360Connector's Postman-derived
-- tables — flow_key PK — they are catalog property, not console property)
-- KEEP: api_environments, api_env_vars, api_collections, api_requests,
--       api_history, api_coll_runs, api_flow_runs, api_code_decodes
-- ============================================================================
