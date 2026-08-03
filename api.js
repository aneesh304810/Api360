// API client with DEMO -> LIVE fallback. Every call falls back to embedded
// mock data when the backend is unreachable, so the UI works offline.
import * as MOCK from './mockData.js';

const BASE = import.meta.env.VITE_API_BASE || '/api';
let LIVE = null; // null=unknown, true/false after probe

export async function probeApi() {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2500) });
    LIVE = r.ok;
  } catch {
    LIVE = false;
  }
  return LIVE;
}

export function isLive() { return LIVE === true; }

// preserve project_id across calls when present in the URL
function projParam() {
  const p = new URLSearchParams(window.location.search).get('project');
  return p ? `project_id=${encodeURIComponent(p)}` : '';
}

async function get(path, mockFn) {
  // NOTE: we do NOT permanently latch to mock mode on a single failure.
  // A transient timeout/slow query must not turn the whole app "empty" for
  // the rest of the session. Each call attempts the network again; only if
  // it fails do we fall back to mock for THAT call.
  try {
    const sep = path.includes('?') ? '&' : '?';
    const pp = projParam();
    const url = `${BASE}${path}${pp ? sep + pp : ''}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    LIVE = true;
    return await r.json();
  } catch {
    // keep LIVE as-is (a slow call shouldn't flip the badge); fall back once.
    return mockFn();
  }
}

async function post(path, body, mockFn, method = 'POST') {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    LIVE = true;
    return await r.json();
  } catch (e) {
    return mockFn ? mockFn() : { ok: false, error: String(e) };
  }
}

export const api = {
  search: (q, project_id) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (project_id && project_id !== 'all') params.set('project_id', project_id);
    return get(`/search?${params.toString()}`, () => MOCK.search(q, project_id));
  },
  projects: () => get('/projects', () => MOCK.projects()),
  projectCategories: () => get('/projects/categories', () => MOCK.projectCategories()),

  interfaceStats: () => get('/interface360/stats', () => MOCK.interfaceStats()),
  interfaces: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.source_project_id) q.set('source_project_id', opts.source_project_id);
    if (opts.target_project_id) q.set('target_project_id', opts.target_project_id);
    if (opts.feed_type) q.set('feed_type', opts.feed_type);
    const qs = q.toString();
    return get(`/interface360/interfaces${qs ? '?' + qs : ''}`,
      () => MOCK.interfaces(opts));
  },
  interfaceSystems: () => get('/interface360/systems', () => MOCK.interfaceSystems()),
  interfaceFacets: () => get('/interface360/facets', () => MOCK.interfaceFacets()),

  feeds: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.feed_class) q.set('feed_class', opts.feed_class);
    if (opts.geography) q.set('geography', opts.geography);
    const qs = q.toString();
    return get(`/data360/feeds${qs ? '?' + qs : ''}`, () => MOCK.feeds(opts));
  },
  lineage: (project_id) => get(
    `/data360/lineage${project_id ? '?project_id=' + project_id : ''}`,
    () => MOCK.lineage(project_id)),
  graph: (project_id, plane = 'Data') => {
    const q = new URLSearchParams({ plane });
    if (project_id) q.set('project_id', project_id);
    return get(`/data360/graph?${q.toString()}`, () => MOCK.graph(project_id, plane));
  },
  columnLineage: (dataset_key) => get(
    `/data360/column-lineage${dataset_key ? '?dataset_key=' + encodeURIComponent(dataset_key) : ''}`,
    () => MOCK.columnLineage(dataset_key)),
  transformation: (dataset_key) => get(
    `/data360/transformation/${encodeURIComponent(dataset_key)}`,
    () => MOCK.transformation(dataset_key)),
  apiSources: (project_id) => get(
    `/api360/sources${project_id && project_id !== 'all' ? '?project_id=' + project_id : ''}`,
    () => MOCK.apiSources(project_id)),
  endpointDetail: (endpoint_key, opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.operation_id) qs.set('operation_id', opts.operation_id);
    if (opts.method) qs.set('method', opts.method);
    if (opts.path) qs.set('path', opts.path);
    const q = qs.toString();
    return get(`/api360/endpoint/${encodeURIComponent(endpoint_key)}${q ? '?' + q : ''}`, () => ({}));
  },
  apiSourceDetail: (source_id) => get(
    `/api360/sources/${encodeURIComponent(source_id)}`,
    () => MOCK.apiSourceDetail(source_id)),
  apiStats: () => get('/api360/stats', () => MOCK.apiStats()),
  apiDependencies: (project_id) => get(
    `/api360/dependencies${project_id ? '?project_id=' + project_id : ''}`,
    () => MOCK.apiDependencies(project_id)),
  apiEndpointPicker: (opts = {}) => {
    const qs = new URLSearchParams(Object.entries(opts).filter(([, v]) => v)).toString();
    return get(`/api360/endpoint-picker${qs ? '?' + qs : ''}`, () => MOCK.endpointPicker(opts));
  },
  apiDomains: (project_id) => get(
    `/api360/domains${project_id && project_id !== 'all' ? '?project_id=' + project_id : ''}`,
    () => MOCK.apiDomainsList()),
  apiSuggestOrder: (endpoint_keys) => post('/api360/suggest-order', { endpoint_keys },
    () => ({ ordered: endpoint_keys, warnings: [] })),
  apiCreateFlow: (payload) => post('/api360/business-flow', payload,
    () => ({ ok: true, flow_id: 'demo', step_count: (payload.steps || []).length })),
  apiBusinessFlows: (project_id) => get(
    `/api360/business-flows${project_id && project_id !== 'all' ? '?project_id=' + project_id : ''}`,
    () => MOCK.businessFlows(project_id)),
  apiBusinessFlow: (flow_id) => get(
    `/api360/business-flow/${encodeURIComponent(flow_id)}`,
    () => MOCK.businessFlowDetail(flow_id)),
  apiFlows: (project_id) => get(
    `/api360/flows${project_id ? '?project_id=' + project_id : ''}`,
    () => MOCK.apiFlows(project_id)),
  search: (q, project_id) => {
    const qs = new URLSearchParams({ q, ...(project_id ? { project_id } : {}) }).toString();
    return get(`/search?${qs}`, () => MOCK.search(q));
  },
  projectLanding: () => get('/projects/landing', () => MOCK.projectLanding()),
  projectSources: (pid) => get(`/projects/${encodeURIComponent(pid)}/sources`, () => MOCK.projectSources(pid)),
  inboundFeeds: (opts = {}) => {
    const qs = new URLSearchParams(Object.entries(opts).filter(([, v]) => v)).toString();
    return get(`/data360/inbound-feeds${qs ? '?' + qs : ''}`, () => MOCK.inboundFeeds(opts));
  },
  inboundFeedWorkstreams: () => get('/data360/inbound-feed-workstreams', () => MOCK.inboundFeedWorkstreams()),
  inboundFeedDetail: (feed) => get(
    `/data360/inbound-feed/${encodeURIComponent(feed)}`, () => MOCK.inboundFeedDetail(feed)),
  pipelines: (project_id) => get(
    `/data360/pipelines${project_id && project_id !== 'all' ? '?project_id=' + project_id : ''}`,
    () => MOCK.pipelines(project_id)),
  pipelineDetail: (id) => get(
    `/data360/pipelines/${encodeURIComponent(id)}`, () => MOCK.pipelineDetail(id)),
  pipelineModel: (id, model) => get(
    `/data360/pipelines/${encodeURIComponent(id)}/model/${encodeURIComponent(model)}`,
    () => MOCK.pipelineModel(id, model)),
  datapointGroups: () => get('/data360/datapoint-groups', () => MOCK.datapointGroups()),
  datapoints: (opts = {}) => {
    const qs = new URLSearchParams(Object.entries(opts).filter(([, v]) => v != null && v !== '')).toString();
    return get(`/data360/datapoints${qs ? '?' + qs : ''}`, () => MOCK.datapointsList(opts));
  },
  datapointDetail: (name) => get(
    `/data360/datapoint/${encodeURIComponent(name)}`, () => MOCK.datapointDetail(name)),
  data360Stats: () => get('/data360/stats', () => MOCK.data360Stats()),

  piiStats: () => get('/pii/stats', () => MOCK.piiStats()),
  piiByAttribute: () => get('/pii/by-attribute', () => MOCK.piiByAttribute()),
  piiByModule: () => get('/pii/by-module', () => MOCK.piiByModule()),
  piiByProject: () => get('/pii/by-project', () => MOCK.piiByProject()),
  piiMatches: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.project_id) q.set('project_id', opts.project_id);
    if (opts.module) q.set('module', opts.module);
    const qs = q.toString();
    return get(`/pii/matches${qs ? '?' + qs : ''}`, () => MOCK.piiMatches(opts));
  },

  // ---- Business-Flow workbook (bf_*): the agreed catalog spine -----------
  bfPipelines: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.domain) q.set('domain', opts.domain);
    if (opts.archetype) q.set('archetype', opts.archetype);
    if (opts.direction) q.set('direction', opts.direction);
    q.set('limit', opts.limit || 500);
    return get(`/bf/pipelines?${q.toString()}`, () => ({ pipelines: [] }));
  },
  bfPipeline: (id) => get(`/bf/pipeline/${encodeURIComponent(id)}`,
    () => ({ pipeline: null, stages: [] })),
  bfCompression: () => get('/bf/compression',
    () => ({ plan: [], summary: [] })),
  bfApiFlows: () => get('/bf/api-flows', () => ({ flows: [] })),
  bfApiFlow: (id) => get(`/bf/api-flow/${encodeURIComponent(id)}`,
    () => ({ flow: null, steps: [] })),

  // ---- Reference Data layer (Datapoint 360 enrichment) -------------------
  referenceCategories: () => get('/reference/categories', () => ({ categories: [] })),
  referenceCategory: (cat) => get(`/reference/category/${encodeURIComponent(cat)}`,
    () => ({ category: cat, fields: [] })),
  referenceForDatapoint: (dp) => get(`/reference/datapoint/${encodeURIComponent(dp)}`,
    () => ({ datapoint: dp, references: [] })),
  referenceUnresolved: () => get('/reference/unresolved', () => ({ unresolved: [] })),

  // ---- Loaders (rich ldr_catalog via data360 router) ----------------------
  loaders: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.domain) q.set('domain', opts.domain);
    if (opts.q) q.set('q', opts.q);
    const qs = q.toString();
    return get(`/data360/loader-catalog${qs ? '?' + qs : ''}`, () => ({ loaders: [] }));
  },
  loaderDetail: (id) => get(`/data360/loader/${encodeURIComponent(id)}`, () => ({})),

  // ---- Interdependency graph (shared-key edges) ---------------------------
  feedGraph: (domain) => get(
    `/data360/feed-graph${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`,
    () => ({ nodes: [], edges: [], hubs: [] })),
  loaderGraph: (domain) => get(
    `/data360/loader-graph${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`,
    () => ({ nodes: [], edges: [], hubs: [] })),

  // ---- Quality Guardrails -------------------------------------------------
  guardrailStats: () => get('/guardrails/stats',
    () => ({ total: 0, attention: 0, failed: 0, warning: 0, critical: 0, by_engine: {} })),
  guardrailAttention: (engine) => get(
    `/guardrails/attention${engine ? `?engine=${encodeURIComponent(engine)}` : ''}`,
    () => ({ events: [] })),
  guardrailEvent: (id) => get(`/guardrails/event/${encodeURIComponent(id)}`, () => ({})),
  guardrailBadData: (id) => get(`/guardrails/event/${encodeURIComponent(id)}/bad-data`,
    () => ({ sample: [], bad_row_count: 0 })),

  // ---- Variance 360 ----
  varSources: () => get('/variance/sources', () => MOCK.varSources()),
  varRuns: (ds) => get(`/variance/runs?data_source=${encodeURIComponent(ds)}`,
    () => MOCK.varRuns()),
  varRun: (id) => get(`/variance/run/${encodeURIComponent(id)}`,
    () => ({ status: 'COMPLETE' })),
  varSummary: (ds, runId) => {
    const q = new URLSearchParams({ data_source: ds });
    if (runId) q.set('run_id', runId);
    return get(`/variance/summary?${q.toString()}`, () => MOCK.varSummary());
  },
  varComposition: (table, ds, stage, runId) => {
    const q = new URLSearchParams({ table, data_source: ds, stage });
    if (runId) q.set('run_id', runId);
    return get(`/variance/composition?${q.toString()}`, () => MOCK.varComposition());
  },
  varField: (lineageId, ds) => get(
    `/variance/field?lineage_id=${encodeURIComponent(lineageId)}&data_source=${encodeURIComponent(ds)}`,
    () => ({ metrics: [], chain: null })),
  varGenerate: (body) => post('/variance/generate', body,
    () => ({ run_id: 'V-DEMO', status: 'RUNNING' })),
  varCoverage: (ds) =>
    get(`/variance/coverage?data_source=${ds}`, () => MOCK.varCoverage()),
  varClobTables: (ds) =>
    get(`/variance/clob/tables?data_source=${ds}`, () => MOCK.varClobTables()),
  varClobColumns: (table, ds) =>
    get(`/variance/clob/columns?table=${encodeURIComponent(table)}&data_source=${ds}`,
        () => MOCK.varClobColumns()),
  varClobProfile: (table, clob, ds) =>
    get(`/variance/clob/profile?table=${encodeURIComponent(table)}&clob=${encodeURIComponent(clob)}&data_source=${ds}`,
        () => MOCK.varClobProfile()),
  varClobRecord: (table, clob, ds) =>
    get(`/variance/clob/record?table=${encodeURIComponent(table)}&clob=${encodeURIComponent(clob)}&data_source=${ds}`,
        () => MOCK.varClobRecord()),
  dsList: () => get('/admin/datasources', () => MOCK.dsList()),
  dsSave: (body) => post('/admin/datasources', body, () => ({ ok: true })),
  dsDelete: (name) => post(`/admin/datasources/${name}/delete`, {},
    () => ({ ok: true })),
  dsTest: (name) => post(`/admin/datasources/${name}/test`, {},
    () => MOCK.dsTest()),
  reconSources: () => get('/recon/sources', () => MOCK.reconSources()),
  reconScan: (body) => post('/recon/scan', body,
    () => ({ run_id: 'PR-DEMO', status: 'RUNNING' })),
  reconRun: (id) => get(`/recon/run/${id}`, () => MOCK.reconRun()),
  reconSummary: (id) => get(`/recon/summary${id ? `?run_id=${id}` : ''}`,
    () => MOCK.reconSummary()),
  reconSchema: (id) => get(`/recon/schema${id ? `?run_id=${id}` : ''}`,
    () => MOCK.reconSchema()),
  reconBreaks: (table, id) =>
    get(`/recon/breaks?table=${encodeURIComponent(table)}${
      id ? `&run_id=${id}` : ''}`, () => MOCK.reconBreaks()),
  reconConfig: () => get('/recon/config', () => MOCK.reconConfig()),
  aconEnvironments: () => get('/apicon/environments',
    () => MOCK.aconEnvironments()),
  aconSaveEnv: (body) => post('/apicon/environments', body,
    () => ({ ok: true })),
  aconCollections: () => get('/apicon/collections',
    () => MOCK.aconCollections()),
  aconCollRequests: (id) => get(`/apicon/collections/${id}/requests`,
    () => MOCK.aconCollRequests()),
  aconBuildCollection: (body) => post('/apicon/collections/build', body,
    () => ({ ok: true, coll_id: 'C-DEMO' })),
  aconExportPostman: (id) => get(`/apicon/collections/${id}/export-postman`,
    () => ({ info: { name: 'demo' }, item: [] })),
  aconRunCollection: (id, envId) =>
    post(`/apicon/collections/${id}/run?env_id=${envId}`, {},
      () => MOCK.aconRunCollection()),
  aconExecute: (body) => post('/apicon/execute', body,
    () => MOCK.aconExecute()),
  aconHistory: () => get('/apicon/history', () => MOCK.aconHistory()),
  aconFlows: () => get('/apicon/flows', () => MOCK.aconFlows()),
  aconFlowRun: (id, body) => post(`/apicon/flows/${id}/run`, body,
    () => MOCK.aconFlowRun()),
  aconGuidedTiles: () => get('/apicon/guided/tiles',
    () => MOCK.aconGuidedTiles()),
  aconFlow: (id) => get(`/apicon/flows/${id}`, () => MOCK.aconFlow()),
  aconSaveBindings: (id, body) => post(`/apicon/flows/${id}/bindings`,
    body, () => ({ ok: true, runnable: true })),
  acatSystems: () => get('/apicon/catalog/systems',
    () => MOCK.acatSystems()),
  acatUpload: (body) => post('/apicon/catalog/upload', body,
    () => ({ ok: true, placed: 'API-SPEC/Demo/swagger-spec-demo.yaml',
      drift_status: 'CURRENT' })),
  acatScan: () => post('/apicon/catalog/scan', {},
    () => ({ ok: true, sources: 197, endpoints: 1240 })),
  acatVersions: (sid) => get(`/apicon/catalog/versions/${sid}`,
    () => MOCK.acatVersions()),
  acatDiff: (sid, v) => get(`/apicon/catalog/diff/${sid}/${v}`,
    () => MOCK.acatDiff()),
  acatAckDrift: (sid) =>
    post(`/apicon/catalog/sources/${sid}/ack-drift`, {},
      () => ({ ok: true })),
  acatDriftUnread: () => get('/apicon/catalog/drift/unread',
    () => ({ unread: 1 })),
  acatEndpoints: (system, q) => get('/apicon/catalog/endpoints?'
    + new URLSearchParams({ ...(system ? { system } : {}),
      ...(q ? { q } : {}) }), () => MOCK.acatEndpoints()),
  acatSuggest: (q, system) => get('/apicon/catalog/suggest?'
    + new URLSearchParams({ q, ...(system ? { system } : {}) }),
    () => MOCK.acatSuggest(q)),
  acatSuggestNext: (endpointKey, have) =>
    get('/apicon/catalog/suggest/next?' + new URLSearchParams(
      { endpoint_key: endpointKey, have: have || '' }),
    () => MOCK.acatSuggestNext()),
  acatPublishFlow: (flowId, pub) =>
    post(`/api360/business-flow/${flowId}`,
      { is_published: pub ? 'Y' : 'N' }, () => ({ ok: true }), 'PATCH'),
  aconSaveRequest: (body) => post('/apicon/requests/save', body,
    () => ({ ok: true })),
  aconAdminSystem: (code) => get(`/apicon/admin/system/${code}`,
    () => MOCK.aconAdminSystem()),
  aconDeleteCollection: (id) => post(`/apicon/collections/${id}`,
    undefined, () => ({ ok: true }), 'DELETE'),
  aconSetSchedule: (id, tag) =>
    post(`/apicon/collections/${id}/schedule?tag=${encodeURIComponent(
      tag || '')}`, {}, () => ({ ok: true })),
  aconSetEnvEnabled: (id, en) =>
    post(`/apicon/environments/${id}/enabled?enabled=${en}`, {},
      () => ({ ok: true })),
  aconDecodes: (set) =>
    get(`/apicon/decodes${set ? `?decode_set=${set}` : ''}`,
      () => ({ decodes: [] })),
  aconSaveDecode: (body) => post('/apicon/decodes', body,
    () => ({ ok: true })),
  aconEnvTest: (id) => post(`/apicon/environments/${id}/test`, {},
    () => ({ ok: true, status: 200, elapsed_ms: 41 })),
  aconExportPostmanEnv: (id) =>
    get(`/apicon/environments/${id}/export-postman-env`,
      () => ({ values: [] })),
};
