// Embedded DEMO data — generated programmatically (not hand-typed) so the UI
// works fully offline. Mirrors the live API response shapes exactly.

const PROJECTS = [
  { project_id: 'sei', display_name: 'SEI Wealth Platform', category: 'SEI', vendor: 'SEI Investments', color_hex: '#0091bf' },
  { project_id: 'pivotal', display_name: 'Pivotal CRM/SalesX', category: 'Non-SEI', vendor: 'In-House', color_hex: '#7c3aed' },
  { project_id: 'addvantage', display_name: 'AddVantage', category: 'Non-SEI', vendor: '3rd Party', color_hex: '#ea580c' },
  { project_id: 'charles_river', display_name: 'Charles River', category: 'Non-SEI', vendor: 'State Street', color_hex: '#2563eb' },
  { project_id: 'internal', display_name: 'Internal / In-House', category: 'Non-SEI', vendor: 'BBH', color_hex: '#0f4775' },
];

// ---- interface factory: build 300 interfaces from realistic patterns -----
const SYSTEMS = [
  ['AddVantage', 'addvantage'], ['Pivotal CRM', 'pivotal'], ['SEI SWP', 'sei'],
  ['Charles River', 'charles_river'], ['PBDW', 'internal'], ['IMDW', 'internal'],
  ['RISK', 'internal'], ['Client Portal', 'internal'], ['Bloomberg', 'bloomberg'],
];
const FEED_TYPES = ['Batch', 'REST API', 'SFTP', 'MQ', 'DB Link', 'File'];
const INTEGRATIONS = ['Accounts', 'Positions', 'Interested Parties', 'Transactions',
  'Statements', 'Orders', 'Reference', 'Linked Accounts', 'Relationship to Account',
  'Fees', 'Cash Activity', 'Taxlots'];
const OWNERS = ['Kelley Barnhardt', 'Data Eng', 'API Team', 'Risk Eng'];
const PII_INTEGRATIONS = new Set(['Interested Parties', 'Statements', 'Accounts']);

function buildInterfaces() {
  const out = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 300; i++) {
    const [ss, sp] = SYSTEMS[Math.floor(rnd() * SYSTEMS.length)];
    let [ts, tp] = SYSTEMS[Math.floor(rnd() * SYSTEMS.length)];
    if (ts === ss) { [ts, tp] = SYSTEMS[(SYSTEMS.findIndex(x => x[0] === ss) + 1) % SYSTEMS.length]; }
    const integ = INTEGRATIONS[Math.floor(rnd() * INTEGRATIONS.length)];
    const ft = FEED_TYPES[Math.floor(rnd() * FEED_TYPES.length)];
    const mig = rnd() > 0.7 ? 'Y' : 'N';
    const pii = PII_INTEGRATIONS.has(integ) ? 'Y' : 'N';
    const cat = pii === 'Y' ? (integ === 'Accounts' ? 'Account Level Sensitive' : 'Client Level Sensitive') : null;
    out.push({
      interface_id: 'if' + i, domain: ['PB', 'PBDW', 'IM', 'CRM'][i % 4],
      application: ss + ' \u2192 ' + ts, integration_name: integ, feed_type: ft,
      source_system: ss, source_project_id: sp, target_system: ts, target_project_id: tp,
      direction: rnd() > 0.5 ? 'Outbound' : 'Inbound',
      frequency: ['Daily (TU-SAT)', 'Intraday', 'Hourly', 'EOD'][i % 4],
      migration_flag: mig, carries_pii: pii, pii_categories: cat,
      update_owner: OWNERS[i % OWNERS.length],
    });
  }
  return out;
}
const ALL_INTERFACES = buildInterfaces();

// ---- feeds (SEI dictionary sample) ---------------------------------------
const FEEDS = [
  { object_name: 'Taxlot', feed_class: 'supplemental', geography: 'US', project_id: 'sei' },
  { object_name: 'End of Day Positions', feed_class: 'standard', geography: 'US', project_id: 'sei' },
  { object_name: 'Account', feed_class: 'standard', geography: 'US', project_id: 'sei' },
  { object_name: 'Transaction', feed_class: 'standard', geography: 'US', project_id: 'sei' },
  { object_name: 'MiFID II Cost and Charges', feed_class: 'standard', geography: 'UK', project_id: 'sei' },
  { object_name: 'Fee Computation', feed_class: 'supplemental', geography: 'US', project_id: 'sei' },
].map(f => ({
  platform_id: 'swp_feeds', schema_name: 'SEI',
  dataset_key: `swp_feeds.sei.${f.object_name}`.toLowerCase(),
  regulatory_scope: f.geography === 'UK' ? 'MiFID II' : null,
  description: `SEI ${f.feed_class} feed`, ...f,
}));

// ---- lineage (medallion: SEI + internal, with cross-project edge) --------
export const NODES = [
  { id: 'swp_feeds.sei.taxlot', name: 'TAXLOT', type: 'FEED', layer: 'bronze', project_id: 'sei', col: 0, row: 0,
    columns: [{ name: 'TAXLOT_ID', type: 'NUMBER(18)', is_pk: 'Y' }, { name: 'PORTFOLIO_ID', type: 'NUMBER(9)' }, { name: 'QTY', type: 'NUMBER(17,4)' }, { name: 'PRICE', type: 'NUMBER(17,4)' }] },
  { id: 'mssql.risk.positions', name: 'positions', type: 'TABLE', layer: 'none', project_id: 'internal', col: 0, row: 1,
    columns: [{ name: 'account_id', type: 'INT' }, { name: 'qty', type: 'DECIMAL' }, { name: 'price', type: 'DECIMAL' }, { name: 'client_name', type: 'VARCHAR' }] },
  { id: 'ora.sei_stage.sei_brz_taxlot', name: 'sei_brz_taxlot', type: 'MODEL', layer: 'bronze', project_id: 'sei', col: 1, row: 0,
    columns: [{ name: 'taxlot_id' }, { name: 'portfolio_id' }, { name: 'qty' }, { name: 'price' }] },
  { id: 'ora.pbdw.brz_positions', name: 'brz_positions', type: 'MODEL', layer: 'bronze', project_id: 'internal', col: 1, row: 1,
    columns: [{ name: 'account_id' }, { name: 'qty' }, { name: 'price' }, { name: 'client_name' }] },
  { id: 'ora.pbdw.slv_positions', name: 'slv_positions', type: 'MODEL', layer: 'silver', project_id: 'internal', col: 2, row: 0,
    columns: [{ name: 'account_id' }, { name: 'mkt_value' }, { name: 'client_name', is_pii: 'Y' }] },
  { id: 'ora.imdw.gld_position_sum', name: 'gld_position_sum', type: 'MODEL', layer: 'gold', project_id: 'internal', col: 3, row: 0,
    columns: [{ name: 'account_id' }, { name: 'total_mkt_value' }, { name: 'position_count' }] },
  { id: 'airflow.swp_medallion', name: 'swp_medallion', type: 'DAG', layer: 'none', project_id: 'sei', col: 2, row: 1,
    columns: [{ name: 'task: sei_brz_taxlot.run' }, { name: 'task: slv_positions.run' }] },
];
export const EDGES = [
  { from_key: 'swp_feeds.sei.taxlot', to_key: 'ora.sei_stage.sei_brz_taxlot', project_id: 'sei' },
  { from_key: 'mssql.risk.positions', to_key: 'ora.pbdw.brz_positions', project_id: 'internal' },
  { from_key: 'ora.sei_stage.sei_brz_taxlot', to_key: 'ora.pbdw.slv_positions', project_id: 'sei' }, // cross-project
  { from_key: 'ora.pbdw.brz_positions', to_key: 'ora.pbdw.slv_positions', project_id: 'internal' },
  { from_key: 'ora.pbdw.slv_positions', to_key: 'ora.imdw.gld_position_sum', project_id: 'internal' },
];
// Orchestration-plane edges (DAG -> model): which DAG runs which model
export const ORCH_EDGES = [
  { from_key: 'airflow.swp_medallion', to_key: 'ora.sei_stage.sei_brz_taxlot', from_type: 'dag', project_id: 'sei' },
  { from_key: 'airflow.swp_medallion', to_key: 'ora.pbdw.slv_positions', from_type: 'dag', project_id: 'sei' },
];
export const COL_EDGES = [
  { from_column: 'ora.pbdw.brz_positions.qty', to_column: 'ora.pbdw.slv_positions.mkt_value', transform_expr: 'qty * price' },
  { from_column: 'ora.pbdw.brz_positions.price', to_column: 'ora.pbdw.slv_positions.mkt_value', transform_expr: 'qty * price' },
  { from_column: 'ora.pbdw.brz_positions.client_name', to_column: 'ora.pbdw.slv_positions.client_name', transform_expr: '1:1' },
  { from_column: 'ora.pbdw.slv_positions.mkt_value', to_column: 'ora.imdw.gld_position_sum.total_mkt_value', transform_expr: 'SUM(mkt_value)' },
  { from_column: 'ora.pbdw.slv_positions.account_id', to_column: 'ora.imdw.gld_position_sum.position_count', transform_expr: 'COUNT(*)' },
];
// compiled SQL per model (the actual transformation)
export const TRANSFORMS = {
  'ora.pbdw.slv_positions': "SELECT account_id,\n       qty * price AS mkt_value,\n       client_name\nFROM   pbdw.brz_positions",
  'ora.imdw.gld_position_sum': "SELECT account_id,\n       SUM(mkt_value)  AS total_mkt_value,\n       COUNT(*)        AS position_count\nFROM   pbdw.slv_positions\nGROUP  BY account_id",
};
// ---- API 360 flows + dependencies ---------------------------------------
export const API_DEPENDENCIES = [
  { from_endpoint: 'POST /accountOverride/update', to_endpoint: 'GET /account/{id}', dep_type: 'reads', project_id: 'sei', method_from: 'POST', method_to: 'GET' },
  { from_endpoint: 'POST /accountOverride/update', to_endpoint: 'POST /activity/log', dep_type: 'calls', project_id: 'sei', method_from: 'POST', method_to: 'POST' },
  { from_endpoint: 'POST /order/entry', to_endpoint: 'GET /asset/{id}', dep_type: 'reads', project_id: 'sei', method_from: 'POST', method_to: 'GET' },
  { from_endpoint: 'POST /order/entry', to_endpoint: 'POST /cash/reserve', dep_type: 'calls', project_id: 'sei', method_from: 'POST', method_to: 'POST' },
];
export const API_FLOWS = [
  { flow_key: 'onboard_account', flow_name: 'Onboard Account', project_id: 'sei',
    steps: [
      { step_order: 1, label: 'Create client', endpoint: 'POST /client/create', variable_passed: 'clientId' },
      { step_order: 2, label: 'Open account', endpoint: 'POST /account/open', variable_passed: 'accountId' },
      { step_order: 3, label: 'Apply override', endpoint: 'POST /accountOverride/update', variable_passed: 'overrideId' },
      { step_order: 4, label: 'Log activity', endpoint: 'POST /activity/log', variable_passed: '-' },
    ] },
  { flow_key: 'place_order', flow_name: 'Place Order', project_id: 'sei',
    steps: [
      { step_order: 1, label: 'Lookup asset', endpoint: 'GET /asset/{id}', variable_passed: 'assetId' },
      { step_order: 2, label: 'Reserve cash', endpoint: 'POST /cash/reserve', variable_passed: 'reservationId' },
      { step_order: 3, label: 'Submit order', endpoint: 'POST /order/entry', variable_passed: 'orderId' },
    ] },
];
export const PLATFORMS = { swp_feeds: 'SWP', ora: 'Oracle', mssql: 'SQL Server', airflow: 'Airflow' };
export const LAYER_STRIPE = { bronze: '#b45309', silver: '#64748b', gold: '#ca8a04', none: '#cbd5e1' };
export const HEADER_H = 46;
export const COL_ROW_H = 24;
export const COL_PAD = 8;

export function nodeHeight(n, expanded) {
  if (!expanded) return HEADER_H;
  const cols = (n.columns || []).length;
  return HEADER_H + COL_PAD * 2 + cols * COL_ROW_H;
}
export function computeLayout(nodes) {
  const COL_W = 230, NODE_W = 175, COL_GAP = 90, ROW_GAP = 36, PAD = 30;
  return nodes.map(n => ({
    ...n,
    x: PAD + n.col * (NODE_W + COL_GAP),
    y: PAD + n.row * (HEADER_H + ROW_GAP),
    w: NODE_W,
  }));
}

// ---- PII demo aggregates -------------------------------------------------
function piiMatchesFromInterfaces() {
  return ALL_INTERFACES.filter(i => i.carries_pii === 'Y').map((i, n) => ({
    match_id: 'm' + n, module: 'interface360', ref_type: 'interface',
    ref_key: i.interface_id, parent_name: i.integration_name,
    matched_field_name: i.integration_name, pii_attribute: i.integration_name,
    sensitivity_category: i.pii_categories, match_confidence: 'partial',
    project_id: i.source_project_id,
  }));
}

// ---- exported mock response builders (match API shapes) ------------------
export const projects = () => ({ projects: PROJECTS });
export const projectCategories = () => ({ categories: { SEI: 1, 'Non-SEI': 4 } });

export const interfaceStats = () => {
  const pii = ALL_INTERFACES.filter(i => i.carries_pii === 'Y').length;
  const mig = ALL_INTERFACES.filter(i => i.migration_flag === 'Y').length;
  const cross = ALL_INTERFACES.filter(i => i.source_project_id !== i.target_project_id).length;
  const sys = new Set(ALL_INTERFACES.flatMap(i => [i.source_system, i.target_system]));
  return { interfaces: ALL_INTERFACES.length, systems: sys.size, carry_pii: pii, migration: mig, cross_project: cross };
};
export const interfaces = (opts = {}) => {
  let rows = ALL_INTERFACES;
  if (opts.source_project_id) rows = rows.filter(i => i.source_project_id === opts.source_project_id);
  if (opts.target_project_id) rows = rows.filter(i => i.target_project_id === opts.target_project_id);
  if (opts.feed_type) rows = rows.filter(i => i.feed_type === opts.feed_type);
  return { interfaces: rows.slice(0, 100) };
};
export const interfaceSystems = () => {
  const agg = {};
  for (const i of ALL_INTERFACES) {
    for (const [sys, proj, dir] of [[i.source_system, i.source_project_id, 'out'], [i.target_system, i.target_project_id, 'in']]) {
      agg[sys] = agg[sys] || { system_name: sys, project_id: proj, outbound_count: 0, inbound_count: 0, total_count: 0, carries_pii: 'N' };
      agg[sys][dir === 'out' ? 'outbound_count' : 'inbound_count']++;
      agg[sys].total_count++;
    }
  }
  return { systems: Object.values(agg).sort((a, b) => b.total_count - a.total_count) };
};
export const interfaceFacets = () => {
  const count = (key) => {
    const m = {};
    for (const i of ALL_INTERFACES) m[i[key]] = (m[i[key]] || 0) + 1;
    return Object.entries(m).map(([value, c]) => ({ value, count: c }));
  };
  return { feed_type: count('feed_type'), source_project: count('source_project_id'), target_project: count('target_project_id') };
};

export const feeds = (opts = {}) => {
  let rows = FEEDS;
  if (opts.feed_class) rows = rows.filter(f => f.feed_class === opts.feed_class);
  if (opts.geography) rows = rows.filter(f => f.geography === opts.geography);
  return { feeds: rows };
};
export const lineage = (project_id) => {
  let edges = EDGES;
  if (project_id) edges = edges.filter(e => e.project_id === project_id);
  return { edges };
};
export const data360Stats = () => ({ by_type: { FEED: FEEDS.length, MODEL: 4, TABLE: 1, DAG: 1 } });

export const piiStats = () => {
  const matches = piiMatchesFromInterfaces();
  const sei = matches.filter(m => m.project_id === 'sei').length;
  return { attributes: 17, components: 43, affected_fields: matches.length, sei, non_sei: matches.length - sei };
};
export const piiByAttribute = () => {
  const m = {};
  for (const x of piiMatchesFromInterfaces()) {
    const k = x.pii_attribute + '|' + x.sensitivity_category;
    m[k] = (m[k] || 0) + 1;
  }
  return { by_attribute: Object.entries(m).map(([k, count]) => {
    const [pii_attribute, sensitivity_category] = k.split('|');
    return { pii_attribute, sensitivity_category, count };
  }).sort((a, b) => b.count - a.count) };
};
export const piiByModule = () => ({ by_module: [{ module: 'interface360', count: piiMatchesFromInterfaces().length }] });
export const piiByProject = () => {
  const m = {};
  for (const x of piiMatchesFromInterfaces()) {
    const k = x.project_id + '|' + x.sensitivity_category;
    m[k] = (m[k] || 0) + 1;
  }
  return { by_project: Object.entries(m).map(([k, count]) => {
    const [project_id, sensitivity_category] = k.split('|');
    const category = project_id === 'sei' ? 'SEI' : 'Non-SEI';
    return { category, project_id, sensitivity_category, count };
  }) };
};
export const piiMatches = (opts = {}) => {
  let rows = piiMatchesFromInterfaces();
  if (opts.project_id) rows = rows.filter(m => m.project_id === opts.project_id);
  return { matches: rows.slice(0, 200) };
};

// ---- plane-aware graph + column lineage + API flow mock builders ---------
export const graph = (project_id, plane = 'Data') => {
  const allow = plane === 'Orchestration' ? ['TABLE', 'VIEW', 'FEED', 'MODEL', 'DAG']
    : plane === 'Transform' ? ['TABLE', 'VIEW', 'FEED', 'MODEL']
    : ['TABLE', 'VIEW', 'FEED'];
  let nodes = NODES.filter((n) => allow.includes(n.type));
  if (project_id) nodes = nodes.filter((n) => n.project_id === project_id);
  const ids = new Set(nodes.map((n) => n.id));
  let edges = EDGES.filter((e) => ids.has(e.from_key) && ids.has(e.to_key));
  if (plane === 'Orchestration') {
    edges = edges.concat(ORCH_EDGES.filter((e) => ids.has(e.from_key) && ids.has(e.to_key)));
  }
  return { nodes, edges, plane };
};
export const columnLineage = (dataset_key) => {
  let edges = COL_EDGES;
  if (dataset_key) edges = edges.filter((e) => e.to_column.startsWith(dataset_key + '.'));
  return { column_edges: edges };
};
export const transformation = (dataset_key) => ({
  target_key: dataset_key, compiled_sql: TRANSFORMS[dataset_key] || null,
});
export const apiDependencies = (project_id) => ({
  dependencies: project_id
    ? API_DEPENDENCIES.filter((d) => d.project_id === project_id) : API_DEPENDENCIES,
});
export const apiFlows = (project_id) => ({
  flows: project_id ? API_FLOWS.filter((f) => f.project_id === project_id) : API_FLOWS,
});

// ---- search mock (matches /search shape; searches demo nodes) ------------
const SEARCH_INDEX = [
  { kind: 'api', module: 'api', name: 'POST /retrieveAccountDetails', description: 'CoreAccounting · produces accountNumber', nav: { module: 'api', tab: 'Sources', id: 'CoreAccounting' } },
  { kind: 'api', module: 'api', name: 'POST /income', description: 'IncomeService · adhoc income', nav: { module: 'api', tab: 'Sources', id: 'IncomeService' }, kw: 'income' },
  { kind: 'api', module: 'api', name: 'POST /fx/deals', description: 'FXService · exchange rate', nav: { module: 'api', tab: 'Sources', id: 'FXService' }, kw: 'exchange' },
  { kind: 'feed', module: 'data', name: 'Account', direction: 'inbound', description: 'Client & Account Onboarding · 32 fields', project_id: 'sei', nav: { module: 'data', tab: 'Inbound Feeds', id: 'Account' } },
  { kind: 'field', module: 'data', name: 'ACCOUNT_NUMBER', data_type: 'CHAR', description: 'Account feed', project_id: 'sei', nav: { module: 'data', tab: 'Inbound Feeds', id: 'swp.sei.account' } },
  { kind: 'field', module: 'data', name: 'ACCOUNT_DISPLAY_NAME', data_type: 'CHAR', is_pii: 'Y', description: 'Account feed', project_id: 'sei', nav: { module: 'data', tab: 'Inbound Feeds', id: 'swp.sei.account' } },
  { kind: 'field', module: 'data', name: 'EXCHANGE_RATE', data_type: 'Decimal(18,9)', description: 'FX deal', project_id: 'sei', nav: { module: 'data', tab: 'Inbound Feeds', id: 'swp.sei.fx' }, kw: 'exchange' },
  { kind: 'datapoint', module: 'datapoint', name: 'account_number', dp_display_name: 'ACCOUNT_NUMBER', occurrence_count: 42, module_count: 5, in_inbound: 'Y', in_outbound: 'Y', nav: { module: 'datapoint', id: 'account_number' } },
  { kind: 'datapoint', module: 'datapoint', name: 'income_realized', dp_display_name: 'INCOME_REALIZED', occurrence_count: 6, in_outbound: 'Y', nav: { module: 'datapoint', id: 'income_realized' }, kw: 'income' },
  { kind: 'datapoint', module: 'datapoint', name: 'exchange_rate', dp_display_name: 'EXCHANGE_RATE', occurrence_count: 7, in_outbound: 'Y', nav: { module: 'datapoint', id: 'exchange_rate' }, kw: 'exchange' },
  { kind: 'dataset', module: 'interface', name: 'Account Outbound', object_type: 'INTERFACE', description: 'SWP → BBH AddVantage', nav: { module: 'interface', id: 'Account Outbound' } },
  { kind: 'loader', module: 'loader', name: 'Adhoc Income Loader', business_domain: 'Income', version: '1.4', description: 'Adhoc income with backup tax', project_id: 'sei', nav: { module: 'data', tab: 'Loaders', id: 'Adhoc_Income_Loader' }, kw: 'income' },
  { kind: 'loader_attr', module: 'loader', name: 'ACCOUNT_NUMBER', optionality: 'Mandatory', description: 'Adhoc Income Loader attribute', project_id: 'sei', nav: { module: 'data', tab: 'Loaders', id: 'Adhoc_Income_Loader' } },
  { kind: 'canonical', module: 'loader', name: 'EXCHANGE_RATE', canonical_data_type: 'Decimal(18,9)', description: 'PSI36 Executed Trade Loader (FX)', project_id: 'sei', nav: { module: 'data', tab: 'Loaders', id: 'PSI36_Executed_Trade_Loader_FX' }, kw: 'exchange' },
  { kind: 'pii', module: 'pii', name: 'Client Name', description: 'Direct Identifier · matches ACCOUNT_DISPLAY_NAME (+23)', nav: { module: 'pii', id: 'Client Name' } },
];
const _subtitle = (r) => {
  if (r.kind === 'feed') return `inbound feed · ${r.business_domain || ''}`;
  if (r.kind === 'field') return `field · ${r.data_type || ''}`;
  if (r.kind === 'datapoint') return `datapoint · ${r.occurrence_count || 0} occurrences`;
  if (r.kind === 'loader') return `loader · ${r.business_domain || ''}${r.version ? ' · v' + r.version : ''}`;
  if (r.kind === 'loader_attr') return `loader attribute · ${r.optionality || ''}`;
  if (r.kind === 'canonical') return `canonical field · ${r.canonical_data_type || ''}`;
  return r.description || '';
};
export const search = (q) => {
  const ql = (q || '').toLowerCase();
  const results = SEARCH_INDEX.filter((r) =>
    r.name.toLowerCase().includes(ql) ||
    (r.description || '').toLowerCase().includes(ql) ||
    (r.kw || '').includes(ql)).map((r) => ({ ...r, subtitle: _subtitle(r), score: 1 }));
  const mods = ['api', 'data', 'datapoint', 'interface', 'loader', 'pii'];
  return { results, query: q, total: results.length,
    counts: Object.fromEntries(mods.map((m) => [m, results.filter((r) => r.module === m).length])) };
};
// ---- API 360 sources/stats mock (matches /api360/* shape) ----------------
const API_SOURCES = [
  { source_id: 'AccountOverride', display_name: 'Account Override Service', feature_group: 'activity-management', kind: 'OpenAPI', release_version: 'PSI45', endpoint_count: 3, project_id: 'sei' },
  { source_id: 'AssetMaster', display_name: 'Asset Master', feature_group: 'asset', kind: 'OpenAPI', release_version: 'PSI45', endpoint_count: 7, project_id: 'sei' },
  { source_id: 'OrderEntry', display_name: 'Order Entry', feature_group: 'order-management', kind: 'OpenAPI', release_version: 'PSI45', endpoint_count: 9, project_id: 'sei' },
  { source_id: 'BloombergRef', display_name: 'Bloomberg Reference', feature_group: 'market-data', kind: 'OpenAPI', release_version: 'v2', endpoint_count: 4, project_id: 'bloomberg' },
];
export const apiSources = (project_id) => {
  let r = API_SOURCES;
  if (project_id && project_id !== 'all') {
    r = project_id === 'sei' ? r.filter((s) => s.project_id === 'sei')
      : project_id === 'non-sei' ? r.filter((s) => s.project_id !== 'sei')
      : r.filter((s) => s.project_id === project_id);
  }
  return { sources: r };
};
export const apiSourceDetail = (source_id) => {
  const s = API_SOURCES.find((x) => x.source_id === source_id) || API_SOURCES[0];
  return { ...s, endpoints: [
    { endpoint_key: `${s.source_id}:POST /update`, method: 'POST', path: '/accountOverride/update',
      function_point_id: '491', error_count: 29, requires_auth: 'Y' }] };
};
export const apiStats = () => ({
  sources: API_SOURCES.length,
  endpoints: API_SOURCES.reduce((a, s) => a + s.endpoint_count, 0),
  pii_fields: 6, flows: 2,
  project_counts: { all: API_SOURCES.length,
    sei: API_SOURCES.filter((s) => s.project_id === 'sei').length,
    'non-sei': API_SOURCES.filter((s) => s.project_id !== 'sei').length },
});

// ---- API 360 business flows mock (runbook view) --------------------------
const BUSINESS_FLOWS = [
  { flow_id: 'gen_taxlot', display_name: 'Tax Lot Audit for a Portfolio', generated_name: 'Get Tax Lots',
    business_name: 'Tax Lot Audit for a Portfolio', domain: 'core-accounting', origin: 'curated', step_count: 4,
    goal: 'Audit open tax lots (cost basis, acquisition date, quantity) for a portfolio.', persona: 'Audit, middle office' },
  { flow_id: 'gen_recon', display_name: 'Daily Position Reconciliation', generated_name: 'Daily Position Reconciliation',
    business_name: null, domain: 'core-accounting', origin: 'generated', step_count: 5,
    goal: 'Reconcile end-of-day positions against the prior day and explain deltas.', persona: null },
  { flow_id: 'gen_cash', display_name: 'Cash Balance & Projection Check', generated_name: 'Cash Balance Check',
    business_name: 'Cash Balance & Projection Check', domain: 'cash', origin: 'curated', step_count: 4,
    goal: 'Determine spendable cash today and project forward from fixed-income flows.', persona: 'Operations analyst' },
];
const BUSINESS_FLOW_STEPS = {
  gen_taxlot: [
    { step_order: 1, endpoint_key: 'POST /v2/oauthtoken', method: 'POST', path: '/v2/oauthtoken', operation_id: 'oauthTokenUsingPOST', produces_entity: 'access_token', consumes_entity: null, feature_group: 'documents', note: 'Authenticate; captures access_token' },
    { step_order: 2, endpoint_key: 'POST /retrieveAccountDetails', method: 'POST', path: '/retrieveAccountDetails', operation_id: 'retrieveAccountDetailsUsingPOST', produces_entity: 'accountNumber', consumes_entity: 'clientId', feature_group: 'client-management', note: 'Validate account, look up portfolios' },
    { step_order: 3, endpoint_key: 'GET /portfolio/taxlots', method: 'GET', path: '/portfolio/taxlots', operation_id: 'getTaxLotsUsingGET', produces_entity: null, consumes_entity: 'accountNumber, portfolioId', feature_group: 'core-accounting', note: 'Pull every open tax lot' },
    { step_order: 4, endpoint_key: 'GET /transactions', method: 'GET', path: '/transactions', operation_id: 'getTransactionsUsingGET', produces_entity: null, consumes_entity: 'accountNumber', feature_group: 'core-accounting', note: 'Reconcile against buy/sell activity' },
  ],
};
export const businessFlows = (project_id) => ({ business_flows: BUSINESS_FLOWS });
export const businessFlowDetail = (flow_id) => {
  const f = BUSINESS_FLOWS.find((x) => x.flow_id === flow_id) || BUSINESS_FLOWS[0];
  return { ...f, steps: BUSINESS_FLOW_STEPS[f.flow_id] || BUSINESS_FLOW_STEPS.gen_taxlot };
};

// ---- Flow builder mocks --------------------------------------------------
const PICKER_ENDPOINTS = [
  { endpoint_key: 'POST /v2/oauthtoken', method: 'POST', path: '/v2/oauthtoken', operation_id: 'oauthTokenUsingPOST', summary: 'Authenticate', feature_group: 'documents' },
  { endpoint_key: 'GET /firm-base-curr-cache', method: 'GET', path: '/firm-base-curr-cache', operation_id: 'firmBaseCurrUsingGET', summary: 'Firm base currency', feature_group: 'infrastructure' },
  { endpoint_key: 'POST /retrieveAccountDetails', method: 'POST', path: '/retrieveAccountDetails', operation_id: 'retrieveAccountDetailsUsingPOST', summary: 'Account details', feature_group: 'client-management' },
  { endpoint_key: 'GET /realtimeholdings', method: 'GET', path: '/realtimeholdings', operation_id: 'realtimeHoldingsUsingGET', summary: 'Current holdings', feature_group: 'core-accounting' },
  { endpoint_key: 'GET /portfolio/taxlots', method: 'GET', path: '/portfolio/taxlots', operation_id: 'getTaxLotsUsingGET', summary: 'Open tax lots', feature_group: 'core-accounting' },
  { endpoint_key: 'GET /transactions', method: 'GET', path: '/transactions', operation_id: 'getTransactionsUsingGET', summary: 'Activity log', feature_group: 'core-accounting' },
  { endpoint_key: 'POST /netavailablecurrencybalance', method: 'POST', path: '/netavailablecurrencybalance', operation_id: 'netAvailBalUsingPOST', summary: 'Available cash', feature_group: 'core-accounting' },
  { endpoint_key: 'POST /loader', method: 'POST', path: '/loader', operation_id: 'submitFileUsingPOST', summary: 'Submit loader file', feature_group: 'loader-framework' },
];
export const endpointPicker = (opts = {}) => {
  let r = PICKER_ENDPOINTS;
  if (opts.domain) r = r.filter((e) => e.feature_group === opts.domain);
  if (opts.q) { const q = opts.q.toLowerCase();
    r = r.filter((e) => (e.path + e.operation_id + e.summary).toLowerCase().includes(q)); }
  return { endpoints: r };
};
export const apiDomainsList = () => ({ domains: [
  { domain: 'core-accounting', c: 42 }, { domain: 'client-management', c: 38 },
  { domain: 'documents', c: 12 }, { domain: 'infrastructure', c: 9 },
  { domain: 'loader-framework', c: 4 }, { domain: 'order-management', c: 27 },
]});

// ---- Data 360 pipelines mock ---------------------------------------------
const PIPELINES = [
  { pipeline_id: 'positions', display_name: 'Positions', schedule: 'EOD', project_id: 'sei', model_count: 6, feed_count: 1, last_status: 'success', dags: [{ dag_id: 'swp_eod_positions', schedule: 'EOD' }], run_summary: { success: 8, failed: 0 } },
  { pipeline_id: 'nav', display_name: 'Nav', schedule: 'EOD', project_id: 'internal', model_count: 5, feed_count: 0, last_status: 'running', dags: [{ dag_id: 'acct_nav_calculation', schedule: 'EOD' }], run_summary: { success: 6, running: 1 } },
  { pipeline_id: 'cash', display_name: 'Cash', schedule: 'Intraday', project_id: 'internal', model_count: 4, feed_count: 1, last_status: 'success', dags: [{ dag_id: 'acct_cash_processing', schedule: 'Intraday' }], run_summary: { success: 10 } },
  { pipeline_id: 'taxlots', display_name: 'Taxlots', schedule: 'EOD', project_id: 'sei', model_count: 4, feed_count: 1, last_status: 'failed', dags: [{ dag_id: 'swp_eod_positions', schedule: 'EOD' }], run_summary: { success: 4, failed: 2 } },
  { pipeline_id: 'fees', display_name: 'Fees', schedule: 'EOD', project_id: 'internal', model_count: 4, feed_count: 0, last_status: 'success', dags: [{ dag_id: 'acct_fee_calculation', schedule: 'EOD' }], run_summary: { success: 7 } },
];
export const pipelines = () => ({ pipelines: PIPELINES });
export const pipelineDetail = (id) => {
  const p = PIPELINES.find((x) => x.pipeline_id === id) || PIPELINES[0];
  return {
    ...p,
    feeds: p.feed_count ? [{ feed: 'SWP Taxlot EOD Feed', schema_name: 'sei_stage', feed_class: 'standard', geography: 'US' }] : [],
    models: [
      { model: `sei_brz_${p.pipeline_id}`, layer: 'bronze', schema_name: 'sei_stage', business_desc: `Raw ${p.pipeline_id} landing` },
      { model: `sei_stg_${p.pipeline_id}`, layer: 'silver', schema_name: 'pbdw', business_desc: `Cleansed ${p.pipeline_id}` },
      { model: `sei_int_${p.pipeline_id}_enriched`, layer: 'silver', schema_name: 'pbdw', business_desc: `FX-enriched ${p.pipeline_id}` },
      { model: `sei_gld_${p.pipeline_id}_summary`, layer: 'gold', schema_name: 'imdw', business_desc: `${p.display_name} summary mart` },
    ],
    runs: [
      { dag_id: p.dags[0].dag_id, task_id: `sei_brz_${p.pipeline_id}_run`, status: 'success', duration_s: 42 },
      { dag_id: p.dags[0].dag_id, task_id: `sei_stg_${p.pipeline_id}_run`, status: 'success', duration_s: 88 },
      { dag_id: p.dags[0].dag_id, task_id: `sei_gld_${p.pipeline_id}_summary_run`, status: p.last_status, duration_s: 120 },
    ],
    lineage_edges: [
      { from_key: `sei_brz_${p.pipeline_id}`, to_key: `sei_stg_${p.pipeline_id}`, edge_type: 'dbt' },
      { from_key: `sei_stg_${p.pipeline_id}`, to_key: `sei_int_${p.pipeline_id}_enriched`, edge_type: 'dbt' },
      { from_key: `sei_int_${p.pipeline_id}_enriched`, to_key: `sei_gld_${p.pipeline_id}_summary`, edge_type: 'dbt' },
    ],
  };
};
export const pipelineModel = (id, model) => ({
  model,
  transformation: { dbt_model: model, transform_type: 'dbt_model',
    compiled_sql: `SELECT account_id,\n       as_of_date,\n       SUM(amount_usd) AS market_value_usd,\n       COUNT(*) AS position_count\nFROM pbdw.sei_int_${id}_enriched\nGROUP BY account_id, as_of_date` },
  column_lineage: [
    { from_column: 'amount_usd', to_column: 'market_value_usd', transform_expr: 'SUM(amount_usd)' },
    { from_column: '*', to_column: 'position_count', transform_expr: 'COUNT(*)' },
  ],
});

// ---- Datapoint 360 direction-grouped mocks -------------------------------
const DP_ALL = [
  { dp_name_normalized: 'account_number', dp_display_name: 'ACCOUNT_NUMBER', occurrence_count: 42, module_count: 5, is_pii: 'N', is_key: 'Y', in_inbound: 'Y', in_outbound: 'Y' },
  { dp_name_normalized: 'account_display_name', dp_display_name: 'ACCOUNT_DISPLAY_NAME', occurrence_count: 18, module_count: 3, is_pii: 'Y', pii_attribute: 'Client Name', pii_category: 'Direct Identifier', is_key: 'N', in_inbound: 'Y', in_outbound: 'N' },
  { dp_name_normalized: 'portfolio_id', dp_display_name: 'PORTFOLIO_ID', occurrence_count: 31, module_count: 4, is_pii: 'N', is_key: 'Y', in_inbound: 'Y', in_outbound: 'Y' },
  { dp_name_normalized: 'cost_basis', dp_display_name: 'COST_BASIS', occurrence_count: 9, module_count: 2, is_pii: 'N', is_key: 'N', in_inbound: 'Y', in_outbound: 'N' },
  { dp_name_normalized: 'nav_usd', dp_display_name: 'NAV_USD', occurrence_count: 12, module_count: 2, is_pii: 'N', is_key: 'N', in_inbound: 'N', in_outbound: 'Y' },
  { dp_name_normalized: 'market_value', dp_display_name: 'MARKET_VALUE', occurrence_count: 22, module_count: 3, is_pii: 'N', is_key: 'N', in_inbound: 'Y', in_outbound: 'Y' },
  { dp_name_normalized: 'loader_status', dp_display_name: 'LOADER_STATUS', occurrence_count: 6, module_count: 1, is_pii: 'N', is_key: 'N', in_inbound: 'N', in_outbound: 'Y' },
];
export const datapointGroups = () => ({
  groups: [
    { key: 'inbound', label: 'Inbound Feeds', project: 'SEI', source: 'SWP EOD feeds',
      count: DP_ALL.filter((d) => d.in_inbound === 'Y').length },
    { key: 'outbound', label: 'Outbound Feeds', project: 'SEI', source: 'Loaders',
      count: DP_ALL.filter((d) => d.in_outbound === 'Y').length },
  ],
  shared: DP_ALL.filter((d) => d.in_inbound === 'Y' && d.in_outbound === 'Y').length,
  total: DP_ALL.length,
});
export const datapointsList = (opts = {}) => {
  let r = DP_ALL;
  if (opts.direction === 'inbound') r = r.filter((d) => d.in_inbound === 'Y');
  else if (opts.direction === 'outbound') r = r.filter((d) => d.in_outbound === 'Y');
  else if (opts.direction === 'both') r = r.filter((d) => d.in_inbound === 'Y' && d.in_outbound === 'Y');
  if (opts.q) r = r.filter((d) => d.dp_name_normalized.includes(opts.q.toLowerCase()));
  if (opts.pii_only) r = r.filter((d) => d.is_pii === 'Y');
  return { datapoints: r };
};
export const datapointDetail = (name) => {
  const d = DP_ALL.find((x) => x.dp_name_normalized === name) || DP_ALL[0];
  const inb = d.in_inbound === 'Y' ? [
    { module: 'Inbound', ref_key: `swp_feeds.sei.account.${name}`, ref_label: `Account feed \u00b7 ${d.dp_display_name}`, direction: 'inbound', project_id: 'sei' },
    { module: 'Inbound', ref_key: `swp_feeds.sei.end_of_day_positions.${name}`, ref_label: `EOD Positions feed \u00b7 ${d.dp_display_name}`, direction: 'inbound', project_id: 'sei' },
  ] : [];
  const outb = d.in_outbound === 'Y' ? [
    { module: 'Outbound', ref_key: `loader.position_loader.${name}`, ref_label: `Position Loader \u00b7 ${d.dp_display_name}`, direction: 'outbound', project_id: 'sei' },
  ] : [];
  return { ...d, occurrences: [...inb, ...outb],
    by_direction: { inbound: inb, outbound: outb, other: [] } };
};

// ---- Inbound Feed Catalog mocks (SWP EOD feeds) --------------------------
const INBOUND_FEEDS = [
  { feed: 'Account', workstream: 'Client& Account Onboarding', feed_class: 'static', domain: 'account', business_desc: 'The Account Interface gives details of all accounts on the platform', field_count: 32, project_id: 'sei' },
  { feed: 'End of Day Positions', workstream: 'Portfolio Accounting', feed_class: 'financial', domain: 'positions', business_desc: 'End of Day Positions Interface provides all EOD positions', field_count: 18, project_id: 'sei' },
  { feed: 'Taxlot', workstream: 'Portfolio Management', feed_class: 'static', domain: 'taxlots', business_desc: 'Open taxlots for a SWP account', field_count: 12, project_id: 'sei' },
  { feed: 'Transaction Detail', workstream: 'Portfolio Accounting', feed_class: 'financial', domain: 'transactions', business_desc: 'All transactions that occurred on the account', field_count: 40, project_id: 'sei' },
  { feed: 'Fee Computation', workstream: 'Bill & Fee Processing', feed_class: 'financial', domain: 'fees', business_desc: 'Computed periodic fees', field_count: 22, project_id: 'sei' },
  { feed: 'Asset', workstream: 'Asset Data (SMF)', feed_class: 'static', domain: 'asset', business_desc: 'Details on all assets subscribed by the firm', field_count: 55, project_id: 'sei' },
];
const FEED_FIELDS = {
  'Account': [
    { name: 'ACCOUNT_NUMBER', business_desc: 'Client Account Number', data_type: 'CHAR', max_length: 17, nullable: 'N', is_reference: 'N', is_pii: 'N', position_order: 1 },
    { name: 'ACCOUNT_DISPLAY_NAME', business_desc: 'Account display name', data_type: 'CHAR', max_length: 100, nullable: 'N', is_reference: 'N', is_pii: 'Y', pii_attribute: 'Client Name', position_order: 2 },
    { name: 'ACCOUNT_BASE_CURRENCY', business_desc: 'Base Currency of the Account', data_type: 'CHAR', max_length: 3, nullable: 'N', is_reference: 'Y', is_pii: 'N', position_order: 6 },
    { name: 'PORTFOLIO_ID', business_desc: 'SEI Wealth Platform Portfolio ID', data_type: 'NUMBER(9)', max_length: 9, nullable: 'N', is_reference: 'Y', is_pii: 'N', position_order: 7 },
    { name: 'MIFID_CLASSIFICATION', business_desc: 'Standard UK client classification', data_type: 'NUMBER(5)', max_length: 5, nullable: 'Y', is_reference: 'Y', is_pii: 'N', position_order: 18 },
  ],
};
export const inboundFeeds = (opts = {}) => {
  let r = INBOUND_FEEDS;
  if (opts.workstream) r = r.filter((f) => f.workstream === opts.workstream);
  if (opts.q) r = r.filter((f) => f.feed.toLowerCase().includes(opts.q.toLowerCase()));
  return { feeds: r };
};
export const inboundFeedWorkstreams = () => {
  const byWs = {};
  INBOUND_FEEDS.forEach((f) => { byWs[f.workstream] = (byWs[f.workstream] || 0) + 1; });
  return { workstreams: Object.entries(byWs).map(([workstream, c]) => ({ workstream, c })), total: INBOUND_FEEDS.length };
};
export const inboundFeedDetail = (feed) => {
  const f = INBOUND_FEEDS.find((x) => x.feed === feed) || INBOUND_FEEDS[0];
  return { ...f, fields: FEED_FIELDS[f.feed] || FEED_FIELDS['Account'] };
};

// ---- Project landing mocks (project as parent) ---------------------------
export const projectLanding = () => ({
  projects: [
    { project_id: 'sei', display_name: 'SEI Wealth Platform', category: 'SEI', vendor: 'SEI Investments',
      color_hex: '#0091bf', description: 'SWP migration — inbound EOD feeds + outbound loaders',
      counts: { inbound_feeds: 43, loaders: 25, dbt_models: 76, apis: 198, interfaces: 828 },
      sources: [
        { source_key: 'inbound_feeds', source_label: 'SWP EOD Inbound Feeds', connector: 'FeedDictionaryConnector', direction: 'inbound', structure_note: 'Contents + per-feed sheets via HYPERLINK' },
        { source_key: 'loaders', source_label: 'SEI Loaders Workbook', connector: 'LoaderWorkbookConnector', direction: 'outbound', structure_note: '10-sheet workbook' },
        { source_key: 'dbt', source_label: 'dbt models', connector: 'DbtConnector', direction: null, structure_note: 'manifest.json' },
        { source_key: 'airflow', source_label: 'Airflow DAGs', connector: 'AirflowConnector', direction: null, structure_note: 'file or Postgres' },
      ] },
    { project_id: 'bloomberg', display_name: 'Bloomberg', category: 'Non-SEI', vendor: 'Bloomberg L.P.',
      color_hex: '#000000', description: 'Market & reference data — different feed structure',
      counts: { inbound_feeds: 0, loaders: 0, dbt_models: 0, apis: 4, interfaces: 0 },
      sources: [] },
  ],
});
export const projectSources = (pid) => {
  const p = projectLanding().projects.find((x) => x.project_id === pid);
  return { project_id: pid, sources: p ? p.sources : [] };
};

// ---------------------------------------------------------------------------
// Variance 360 — DEMO data
// ---------------------------------------------------------------------------
export const varSources = () => ({ sources: [
  { data_source: 'PBDW', tables: 31, fields: 2688, mapped: 2534 },
  { data_source: 'IMDS', tables: 14, fields: 1102, mapped: 989 },
] });

export const varRuns = () => ({ runs: [
  { run_id: 'ING20260720_060211', run_type: 'STAGE', scope: 'INGESTION',
    status: 'COMPLETE', started_at: '2026-07-20 06:02:11',
    finished_at: '2026-07-20 06:02:52', rows_scanned: 2114882,
    cols_profiled: 96, sql_hash: '4be2f1a09c31d7e0' },
] });

export const varSummary = () => ({ run_id: 'ING20260720_060211', functions: [],
  tables: [
    { table_name: 'POS_LOT_DETAIL', functional_group: 'Positions & Holdings',
      fields_total: 96, fields_variant: 16, variance_score: 38.4,
      worst_hop: 'STG1->STG2', breaks_src_stg1: 0, breaks_stg1_stg2: 14,
      breaks_stg2_dwh: 2, dominant_metric: 'SUM', status: 'RED' },
    { table_name: 'TXN_CASHFLOW', functional_group: 'Transactions',
      fields_total: 88, fields_variant: 7, variance_score: 24.1,
      worst_hop: 'SRC->STG1', breaks_src_stg1: 7, breaks_stg1_stg2: 0,
      breaks_stg2_dwh: 0, dominant_metric: 'CNT', status: 'RED' },
    { table_name: 'POS_SUMMARY', functional_group: 'Positions & Holdings',
      fields_total: 74, fields_variant: 4, variance_score: 7.9,
      worst_hop: 'STG1->STG2', breaks_src_stg1: 0, breaks_stg1_stg2: 4,
      breaks_stg2_dwh: 0, dominant_metric: 'NDV', status: 'AMBER' },
    { table_name: 'SEC_IDENTIFIERS', functional_group: 'Security Master',
      fields_total: 61, fields_variant: 3, variance_score: 4.9,
      worst_hop: 'STG2->DWH', breaks_src_stg1: 0, breaks_stg1_stg2: 0,
      breaks_stg2_dwh: 3, dominant_metric: 'MAXLEN', status: 'AMBER' },
    { table_name: 'POS_ACCRUALS', functional_group: 'Positions & Holdings',
      fields_total: 62, fields_variant: 0, variance_score: 0, worst_hop: null,
      breaks_src_stg1: 0, breaks_stg1_stg2: 0, breaks_stg2_dwh: 0,
      dominant_metric: null, status: 'GREEN' },
  ] });

export const varComposition = () => ({ run_id: 'ING20260720_060211', columns: [
  { column_name: 'MKT_VALUE_LOCAL', declared_type: 'VARCHAR2(30)',
    inferred_type: 'DECIMAL', conformance_pct: 99.42, pct_decimal: 92.1,
    pct_integer: 3.8, pct_date: 0, pct_bool: 0, pct_blank: 3.5, pct_bad: 0.6,
    bad_rows: 12204, num_prec_max: 18, num_scale_max: 4, risk: 'CAST_UNSAFE',
    verdict: 'cast fails ~12,204 rows — cleanse before cast',
    samples: ['1,204,551.20', '(84500.00)', 'N/A', '84500.00-'],
    pii_suppressed: 'N' },
  { column_name: 'ACCT_NO', declared_type: 'VARCHAR2(20)',
    inferred_type: 'STRING_NUMERICLOOK', conformance_pct: 100,
    pct_integer: 100, pct_decimal: 0, pct_date: 0, pct_bool: 0, pct_blank: 0,
    pct_bad: 0, bad_rows: 0, lead_zero_rows: 719234,
    risk: 'IDENTIFIER_LEADING_ZERO',
    verdict: 'NEVER cast to NUMBER — leading zeros would be lost; keep VARCHAR2',
    samples: [], pii_suppressed: 'Y' },
  { column_name: 'TRADE_DT', declared_type: 'VARCHAR2(10)',
    inferred_type: 'DATE:YYYYMMDD', conformance_pct: 99.97, pct_date: 97.9,
    pct_decimal: 0, pct_integer: 0, pct_bool: 0, pct_blank: 2, pct_bad: 0.1,
    bad_rows: 641, date_mask: 'YYYYMMDD', risk: 'CAST_UNSAFE',
    verdict: 'sentinels 00000000/99991231 — NULLIF then cast',
    samples: ['00000000', '99991231'], pii_suppressed: 'N' },
  { column_name: 'QUANTITY', declared_type: 'VARCHAR2(25)',
    inferred_type: 'DECIMAL', conformance_pct: 100, pct_decimal: 71.2,
    pct_integer: 26.6, pct_date: 0, pct_bool: 0, pct_blank: 2.2, pct_bad: 0,
    bad_rows: 0, num_prec_max: 16, num_scale_max: 6, risk: 'TYPE_DRIFT',
    verdict: 'safe cast -> NUMBER(16,6)', samples: [], pii_suppressed: 'N' },
  { column_name: 'SEC_DESC', declared_type: 'VARCHAR2(120)',
    inferred_type: 'STRING', conformance_pct: 98.9, pct_decimal: 0,
    pct_integer: 0, pct_date: 0, pct_bool: 0, pct_blank: 1.1, pct_bad: 0,
    bad_rows: 0, max_len: 87, risk: null, verdict: 'genuine string',
    samples: [], pii_suppressed: 'N' },
] });

export const varCoverage = () => ({
  census: [
    { status: 'Exists', cnt: 2805 }, { status: '(blank)', cnt: 1136 },
    { status: 'mapped', cnt: 911 }, { status: 'Not Applicable', cnt: 867 },
    { status: 'Does Not Exist', cnt: 223 }, { status: 'unmapped', cnt: 124 }],
  gaps: ['FACT_CASH_SETTLEMENTS','FACT_MBS_FACTOR','FACT_PRICE',
    'FACT_SECURITY_MEASURES','FACT_HOLDINGS_BATCH','FACT_HOLDINGS_UPDATED',
    'DIM_MASTER_ACCOUNT_BLOCKS','DIM_MSTR_ACCT_RELATIONSHIP',
    'DIM_CRM_TAR_CONTACTS','DIM_IPS_CONSOLIDATED','DIM_ACCOUNT_MAP',
    'REF_ACCRUED_INCOME_VARNOTE'],
});
export const varClobColumns = () => ({ columns: [
  { column_name: 'BLOCK_CLOB', blob_count: 31648, len_min: 240, len_max: 380,
    len_mode: 380, len_uniform_pct: 99.7, truncated_cnt: 94,
    structure: 'FIXED_WIDTH', spec_fields: 23, spec_resolved: 21,
    unmapped_regions: '91-98', referenced_by_transform: 'Y' },
]});
export const varClobProfile = () => ({ fields: [
  { field_name: 'FEE_MIN', pos_start: 25, pos_len: 14,
    target_column: 'FEE_MIN_AMOUNT', inferred_type: 'DECIMAL',
    conformance_pct: 99.7, nonnull_rows: 31082, total_rows: 31648,
    bad_rows: 94, mean_val: 1240, stddev_val: 3890, date_mask: null,
    risk: 'CAST_UNSAFE', verdict: '94 values fail NUMBER' },
  { field_name: 'FEE_DT', pos_start: 17, pos_len: 8,
    target_column: 'FEE_DATE', inferred_type: 'DATE:YYYYMMDD',
    conformance_pct: 99.6, nonnull_rows: 30635, total_rows: 31648,
    bad_rows: 121, mean_val: null, stddev_val: null, date_mask: 'YYYYMMDD',
    risk: 'CAST_UNSAFE', verdict: '121 values fail mask (00000000 sentinels)' },
  { field_name: 'BYTES_91_98', pos_start: 91, pos_len: 8, target_column: null,
    inferred_type: 'UNKNOWN', conformance_pct: 0, nonnull_rows: 12844,
    total_rows: 31648, bad_rows: 0, mean_val: null, stddev_val: null,
    date_mask: null, risk: 'UNMAPPED_DATA',
    verdict: 'no transform reads bytes 91-98; non-blank in 12,844 blobs' },
]});

export const varClobRecord = () => ({ suppressed: false,
  record: '00084271070001202606300000001250000000099999900250004217YNT1  D4  00000084521C\u00b1X3@9Z010008427108840000000000                                                        ',
});

export const varClobTables = () => ({ tables: [
  'DIM_ACCOUNT_UD', 'DIM_BBH_IPS', 'STG1_FIS_ACCOUNT_FEE_BLOCKS'] });

export const dsList = () => ({ sources: [
  { name: 'ADDVANTAGE_PROD', role: 'SYSTEM_OF_RECORD', method: 'HOST',
    host: 'advdb1.bbh.com', port: 1521, service: 'ADVP', schemas: 'ADDV',
    username: 'RECON_RO', thick_mode: 'N', read_only: 'Y',
    last_test_ok: 'Y' },
  { name: 'SWP_ADDV_MIRROR', role: 'UNDER_TEST', method: 'HOST',
    host: 'qclpbdb1.testbbh.com', port: 2483, service: 'PBDWHDBQ',
    schemas: 'SWPADV', username: 'A041327', thick_mode: 'Y',
    read_only: 'Y', last_test_ok: 'Y' },
]});
export const dsTest = () => ({ ok: true, steps: [
  '✓ connected in 412 ms · thick',
  '✓ schema SWPADV visible · 178 tables',
  '✓ SELECT COUNT(*) FROM SWPADV.ACCT_MASTER → 272,335'] });

export const reconSources = () => ({
  a: [{ name: 'ADDVANTAGE_PROD', schemas: 'ADDV' }],
  b: [{ name: 'SWP_ADDV_MIRROR', schemas: 'SWPADV' }],
});
export const reconRun = () => ({ run_id: 'PR-DEMO', status: 'COMPLETE',
  tables_total: 180, tables_done: 180, match_rate: 96.2 });
export const reconSummary = () => ({
  run: { run_id: 'PR-DEMO', side_a: 'ADDVANTAGE_PROD',
    side_b: 'SWP_ADDV_MIRROR', schema_a: 'ADDV', schema_b: 'SWPADV',
    status: 'COMPLETE', match_rate: 96.2,
    started_at: '2026-07-28 06:00', tables_total: 180, tables_done: 180 },
  schema_drift: 2,
  tables: [
    { table_name: 'TRN_TRANSACTION', pk_cols: 'ACCT_NO,TRN_SEQ',
      cnt_a: 4214882, cnt_b: 4214882, cols_compared: 42,
      metric_breaks: 'SUM(TRN_AMT) ΔA-B=12,844.16', missing_b: 0,
      extra_b: 0, mismatch: 8412, status: 'RED' },
    { table_name: 'POS_HOLDING', pk_cols: 'ACCT_NO,ASSET_ID',
      cnt_a: 1844206, cnt_b: 1843988, cols_compared: 38,
      metric_breaks: 'CNT ΔA-B=218 · SUM(MKT_VAL) ΔA-B=2,400,112.40',
      missing_b: 218, extra_b: 0, mismatch: 0, status: 'RED' },
    { table_name: 'ACCT_MASTER', pk_cols: 'ACCT_NO', cnt_a: 272335,
      cnt_b: 272335, cols_compared: 61, metric_breaks: null,
      missing_b: 0, extra_b: 0, mismatch: 0, status: 'GREEN' },
  ],
});
export const reconSchema = () => ({ drifts: [
  { table_name: 'ACCT_FEE_SCHEDULE', drift_type: 'B_MISSING_COL',
    column_name: 'FEE_OVERRIDE_PCT', a_def: 'NUMBER(7,4)',
    b_def: 'column absent', severity: 'DRIFT' },
  { table_name: 'POS_TAX_LOT', drift_type: 'TYPE_DRIFT',
    column_name: 'ORIG_FACE', a_def: 'NUMBER(18,6)',
    b_def: 'NUMBER(15,2)', severity: 'FIX_FIRST' },
]});
export const reconBreaks = () => ({
  signature: [
    { cols_differ: 'TRN_AMT', n: 6204 },
    { cols_differ: 'TRN_CODE', n: 1890 },
    { cols_differ: 'SETTLE_DT', n: 318 },
  ],
  breaks: [
    { break_type: 'MISMATCH', pk_value: '0084271·004412',
      cols_differ: 'TRN_AMT', a_values: 'TRN_AMT=1250.00',
      b_values: 'TRN_AMT=1250.03' },
    { break_type: 'MISMATCH', pk_value: '0091730·001208',
      cols_differ: 'TRN_CODE', a_values: 'TRN_CODE=DIV',
      b_values: 'TRN_CODE=DVI' },
  ],
});
export const reconConfig = () => ({ rules: [
  { scope: 'GLOBAL', rule_type: 'IGNORE_COLS',
    rule_value: 'LOAD_DATE,BATCH_ID,CREATED_TSP,UPDATED_TSP',
    note: 'warehouse metadata — legitimately differs' },
]});

export const aconEnvironments = () => ({ environments: [
  { env_id: 'SEI_QA', name: 'SEI QA', vars: [
    { name: 'baseUrl', value: 'https://api-qa.seic.com/wealth/v2' },
    { name: 'accountId', value: '0084271070' },
    { name: 'clientSecret', value: '●●●●●●' }] },
]});

export const aconCollections = () => ({ collections: [
  { coll_id: 'C1', name: 'Accounts API v2.3', source: 'AUTO',
    n_requests: 4 },
  { coll_id: 'C2', name: 'Ops · Parallel-Run Daily Checks',
    source: 'MANUAL', n_requests: 3 },
]});
export const aconCollRequests = () => ({ requests: [
  { req_id: 'R1', folder: 'Accounts', name: 'Get account', method: 'GET',
    url_tmpl: '{{baseUrl}}/accounts/{{accountId}}',
    params_json: '{"include":"objectives,restrictions"}',
    tests_json: '["status == 200","time < 2000"]' },
  { req_id: 'R2', folder: 'Accounts', name: 'Search accounts',
    method: 'POST', url_tmpl: '{{baseUrl}}/accounts/search',
    params_json: '{}', tests_json: '["status == 200"]' },
]});
export const aconExecute = () => ({ status: 200, elapsed_ms: 412,
  bytes: 2412, schema_ok: 'Y', contract: 'Accounts API v2.3',
  schema_notes: [],
  tests: [{ test: 'status == 200', ok: true },
          { test: 'time < 2000', ok: true }],
  body: { accountId: '0084271070', accountName: 'AAAAAAA AAAAA TR',
    status: 'ACTIVE',
    restrictions: [{ code: 700, desc: 'Fund Substitution' },
                   { code: 450, desc: 'No Tobacco' }] } });
export const aconHistory = () => ({ history: [
  { method: 'GET', url_final: 'https://api-qa.seic.com/…/accounts/0084…',
    status_code: 200, elapsed_ms: 412, schema_ok: 'Y', ran_at: '13:42' },
  { method: 'POST', url_final: 'https://api-qa.seic.com/…/transactions',
    status_code: 429, elapsed_ms: 88, schema_ok: null, ran_at: '13:38' },
]});
export const aconRunCollection = () => ({ total: 3, passed: 3, results: [
  { name: 'Get account', ok: true, status: 200, elapsed_ms: 388 },
  { name: 'Get positions', ok: true, status: 200, elapsed_ms: 604 },
  { name: 'Get balances', ok: true, status: 200, elapsed_ms: 512 },
]});

export const aconFlowRun = () => ({ ok: true, report: [
  { step: "Find the office's accounts", ok: true, note: '1 call(s)' },
  { step: 'Get restrictions', ok: true, note: '25 call(s)' },
  { step: 'Shape the answer', ok: true, note: '61 rows' }],
  result: { type: 'table', columns: ['Account', 'Code', 'Meaning'],
    summary: '18 restricted accounts of 25 sampled in NY27',
    rows: [{ Account: '0084271070', Code: 700,
      Meaning: 'Fund Substitution' },
      { Account: '0084271070', Code: 450, Meaning: 'No Tobacco' }] },
  available: { accountList: 'list · 1412 items' } });


export const aconDecodesMock = () => ({ decodes: [
  { decode_set: 'RESTRICTION_CODES', code: '700',
    meaning: 'Fund Substitution' },
  { decode_set: 'RESTRICTION_CODES', code: '450', meaning: 'No Tobacco' },
]});

/* ============ unified catalog (consolidation) ============ */
export const acatSystems = () => ({ systems: [
  { code: 'sei', sources: 197, drift: 1 },
  { code: 'internal', sources: 12, drift: 0 },
  { code: 'addvantage', sources: 0, drift: 0 },
  { code: 'pivotal', sources: 0, drift: 0 },
  { code: 'charles_river', sources: 0, drift: 0 },
  { code: 'bloomberg', sources: 0, drift: 0 }] });

export const acatEndpoints = () => ({ endpoints: [
  { endpoint_key: 'Restrictions:GET /restrictions', method: 'GET',
    path: '/restrictions', operation_id: 'getRestrictions',
    summary: 'List account restrictions',
    feature_group: 'AccountManagement', project_id: 'sei',
    full_endpoint_url: '/restrictions' },
  { endpoint_key: 'Balances:GET /balances', method: 'GET',
    path: '/balances', operation_id: 'getBalances',
    summary: 'Account balances', feature_group: 'Balances',
    project_id: 'sei', full_endpoint_url: '/balances' },
  { endpoint_key: 'Accounts:GET /accounts/{id}', method: 'GET',
    path: '/accounts/{id}', operation_id: 'getAccount',
    summary: 'Account detail', feature_group: 'AccountManagement',
    project_id: 'sei', full_endpoint_url: '/accounts/{id}' }] });

export const acatSuggest = (q) => ({ suggestions: [
  { endpoint_key: 'Restrictions:GET /restrictions', method: 'GET',
    path: '/restrictions', operation_id: 'getRestrictions',
    summary: `matches "${q}"`, feature_group: 'AccountManagement' }] });

export const acatSuggestNext = () => ({ next: [
  { endpoint_key: 'Balances:GET /balances', needs: ['accountId'] }],
  warnings: [] });

export const acatVersions = () => ({ versions: [
  { version_no: 2, release_version: '2.3', ingested_at: 'today',
    breaking_ct: 1, additive_ct: 3 },
  { version_no: 1, release_version: '2.2', ingested_at: 'last month',
    breaking_ct: 0, additive_ct: 0 }] });

export const acatDiff = () => ({
  breaking: ['cashAvailable now required on Balances:GET /balances'],
  additive: ['pledgedAmount added on Balances:GET /balances'] });

export const aconFlow = () => ({ flow_id: 'BF001',
  name: 'Restriction audit for an office', goal: 'demo',
  published: true, runnable: true,
  inputs: [{ name: 'officeCode', label: 'Office code',
    example: 'NY27' }],
  present: { type: 'table', columns: [] },
  steps: [{ step_order: 1,
    endpoint_key: 'Accounts:GET /accounts', method: 'GET',
    path: '/accounts', params: { office: '{{input.officeCode}}' },
    extract: { accts: 'items[].id' }, foreach: null }] });

export const aconFlows = () => ({ flows: [
  { flow_id: 'BF001', name: 'Restriction audit for an office',
    domain: 'AccountManagement', origin: 'GENERATED',
    is_published: 'Y', step_count: 2, runnable: 'Y' },
  { flow_id: 'BF002', name: 'Update account characteristics',
    domain: 'AccountManagement', origin: 'CURATED',
    is_published: 'Y', step_count: 3, runnable: 'N' }] });

export const aconGuidedTiles = () => ({ tiles: [
  { flow_id: 'BF001', name: 'Restriction audit for an office',
    goal: 'Which accounts in an office carry restrictions?',
    domain: 'AccountManagement', origin: 'GENERATED', tile_icon: '🛡',
    runnable: 'Y', inputs: [{ name: 'officeCode',
      label: 'Office code', example: 'NY27' }] },
  { flow_id: 'BF002', name: 'Update account characteristics',
    goal: 'Change servicing attributes on an account',
    domain: 'AccountManagement', origin: 'CURATED',
    runnable: 'N', inputs: [] }] });

export const aconAdminSystem = () => ({ code: 'sei',
  metrics: { sources: 197, endpoints: 1240, published_flows: 57,
    open_drift: 1, pass_rate_7d: 98 },
  sources: [
    { source_id: 'Balances', feature_group: 'Balances',
      release_version: '2.3', endpoint_count: 9,
      drift_status: 'DRIFT',
      drift_note: 'cashAvailable now required on Balances:GET /balances',
      drift_ack_by: null },
    { source_id: 'AccountManagement',
      feature_group: 'AccountManagement', release_version: '4.1',
      endpoint_count: 31, drift_status: 'CURRENT', drift_note: null,
      drift_ack_by: null }] });
