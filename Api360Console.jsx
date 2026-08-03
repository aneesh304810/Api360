import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

let T = {};
const mono = { get fontFamily() { return T.mono; } };
const inp = { height: 30, border: '1px solid #b5b6b6', borderRadius: 2,
  fontSize: 12, padding: '0 9px' };

const Chip = ({ tone, children }) => {
  const map = { get: ['#d0ebd9', '#159943'], post: ['#fae5d3', '#e67e22'],
    put: ['#e0f5fd', '#0091bf'], del: ['#f3d2d7', '#c1113a'],
    green: ['#d0ebd9', '#159943'], red: ['#f3d2d7', '#c1113a'],
    amber: ['#fae5d3', '#e67e22'], grey: ['#dfe6e9', '#666'] };
  const [bg, fg] = map[tone] || map.grey;
  return <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px',
    borderRadius: 999, whiteSpace: 'nowrap', background: bg, color: fg }}>
    {children}</span>;
};
const Panel = ({ title, hint, right, children }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.border}`,
    borderRadius: 3, boxShadow: '0 3px 5px rgba(0,0,0,.08)',
    overflow: 'hidden', marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 13px',
      borderBottom: `1px solid ${T.panel2}`, background: '#fafcfc',
      gap: 10 }}>
      <h2 style={{ fontSize: 11.5, fontWeight: 700,
        textTransform: 'uppercase', margin: 0 }}>{title}</h2>
      {hint && <span style={{ marginLeft: 'auto', fontSize: 10.5,
        color: T.sub }}>{hint}</span>}
      {right}
    </div>
    {children}
  </div>);
const Lbl = ({ children }) => (
  <label style={{ display: 'block', fontSize: 9.5,
    textTransform: 'uppercase', letterSpacing: '.06em', color: T.sub,
    fontWeight: 700, marginBottom: 2 }}>{children}</label>);
const Btn = ({ onClick, primary, children, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{ height: 28, background: primary ? T.accent : '#fff',
      color: primary ? '#fff' : T.accent,
      border: primary ? 0 : `1px solid ${T.border}`, borderRadius: 2,
      fontSize: 11.5, padding: '0 12px', cursor: 'pointer',
      opacity: disabled ? 0.5 : 1 }}>{children}</button>);
const mchip = (m) => (m || 'GET').toLowerCase().slice(0, m === 'DELETE'
  ? 3 : 4);
let SEI_SET = new Set(['SEI']);
const sysMatch = (sys, ps) => {
  const p = (ps || 'SEI').toUpperCase();
  if (sys === 'ALL') return true;
  if (sys === 'NON-SEI') return !SEI_SET.has(p);
  if (sys === 'SEI') return SEI_SET.has(p);
  return p === sys;
};


const SYS_COLORS = { sei: '#31bced', internal: '#0f4775',
  addvantage: '#7c3aed', charles_river: '#0d7a5f', pivotal: '#8e44ad',
  bloomberg: '#d3542a', star: '#d3542a' };
const SYS_LABELS = { sei: 'SEI', internal: 'Internal',
  addvantage: 'AddVantage', charles_river: 'CRD', pivotal: 'Pivotal',
  bloomberg: 'Bloomberg' };
function SystemPills({ value, onChange }) {
  const [systems, setSystems] = useState([]);
  useEffect(() => {
    api.acatSystems().then((d) => setSystems(d.systems || []));
  }, []);
  const seg = ['all', 'sei', 'non-sei'];
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center',
      flexWrap: 'wrap' }}>
      {seg.map((k) => (
        <span key={k} onClick={() => onChange(k)}
          style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px',
            borderRadius: 3, cursor: 'pointer',
            background: value === k ? T.navy : T.panel2,
            color: value === k ? '#fff' : T.sub }}>
          {k === 'all' ? 'All' : k === 'sei' ? 'SEI' : 'Non-SEI'}</span>))}
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
        textTransform: 'uppercase', color: T.sub, marginLeft: 6 }}>
        Legacy system</span>
      {systems.filter((x) => x.code !== 'sei').map((x) => (
        <span key={x.code} onClick={() => onChange(x.code)}
          style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 11px',
            borderRadius: 999, cursor: 'pointer',
            background: value === x.code ? (SYS_COLORS[x.code] || T.accent)
              : T.panel2,
            color: value === x.code ? '#fff' : T.sub }}>
          <span style={{ display: 'inline-block', width: 6, height: 6,
            borderRadius: '50%', marginRight: 4,
            background: value === x.code ? '#fff'
              : (SYS_COLORS[x.code] || T.accent) }} />
          {SYS_LABELS[x.code] || x.code}
          {x.sources ? ` ${x.sources}` : ''}</span>))}
    </div>);
}

/* =========================== GUIDED =========================== */
function GuidedTab({ envId }) {
  const [tiles, setTiles] = useState([]);
  const [sel, setSel] = useState(null);
  const [vals, setVals] = useState({});
  const [ans, setAns] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.aconGuidedTiles().then((d) => setTiles(d.tiles || []));
  }, []);
  const run = () => {
    setBusy(true); setAns(null);
    api.aconFlowRun(sel.flow_id, { env_id: envId, inputs: vals })
      .then((r) => { setAns(r); setBusy(false); });
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr',
      gap: 12 }}>
      <Panel title="What do you want to check?">
        {!tiles.length && <div style={{ padding: '16px 13px', fontSize: 12,
          color: T.sub }}>No published services yet — build one in the
          Flow Builder tab.</div>}
        {tiles.map((t) => (
          <div key={t.flow_id}
            onClick={() => { if (t.runnable !== 'Y') return;
              setSel(t); setVals({}); setAns(null); }}
            style={{ display: 'flex', gap: 8, padding: '9px 13px',
              cursor: 'pointer', fontSize: 12.5,
              background: sel?.flow_id === t.flow_id ? T.infoBg : undefined,
              borderBottom: `1px solid ${T.panel2}` }}>
            <span>{t.tile_icon || '🔎'}</span>
            <span>{t.name}</span>
          </div>))}
      </Panel>
      <div>
        {sel && (
          <Panel title={sel.name} hint={sel.description}>
            <div style={{ display: 'flex', gap: 10, padding: '11px 13px',
              alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {(sel.inputs || []).map((f) => (
                <div key={f.name}>
                  <Lbl>{f.label || f.name}</Lbl>
                  <input style={{ ...inp, ...mono, width: 170 }}
                    placeholder={f.example || ''}
                    value={vals[f.name] || ''}
                    onChange={(e) => setVals({ ...vals,
                      [f.name]: e.target.value })} />
                </div>))}
              <Btn primary onClick={run} disabled={busy}>
                {busy ? 'asking…' : 'Get answer ▶'}</Btn>
            </div>
          </Panel>)}
        {ans && (
          <Panel title={ans.ok ? '✓ Answered' : '✗ Problems'}
            hint="masked per entitlements · evidence-logged"
            right={ans.result?.rows?.length > 0 && (
              <Btn onClick={() => {
                const cols = ans.result.columns;
                const csv = [cols.join(','), ...ans.result.rows.map((r) =>
                  cols.map((c) => `"${String(r[c] ?? '')
                    .replace(/"/g, '""')}"`).join(','))].join('\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([csv],
                  { type: 'text/csv' }));
                a.download = `${(sel?.name || 'answer')
                  .replace(/\W+/g, '_')}.csv`;
                a.click();
              }}>⬇ Excel</Btn>)}>
            {(ans.report || []).map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8,
                padding: '5px 13px', fontSize: 11.5,
                borderBottom: `1px solid ${T.panel2}` }}>
                <Chip tone={s.ok ? 'green' : 'red'}>
                  {s.ok ? '✓' : '✗'}</Chip>
                <span>{s.step}</span>
                <span style={{ color: T.sub }}>{s.note}</span>
              </div>))}
            {ans.result && (
              <div style={{ padding: '10px 13px' }}>
                {ans.result.summary && <div style={{ fontSize: 12.5,
                  fontWeight: 700, marginBottom: 6 }}>
                  {ans.result.summary}</div>}
                {ans.result.rows?.length > 0 && (
                  <table style={{ fontSize: 11.5,
                    borderCollapse: 'collapse', width: '100%' }}>
                    <thead><tr>
                      {ans.result.columns.map((c) => (
                        <td key={c} style={{ fontSize: 9.5,
                          textTransform: 'uppercase', color: T.sub,
                          padding: '2px 10px 2px 0' }}>{c}</td>))}
                    </tr></thead>
                    <tbody>
                      {ans.result.rows.slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          {ans.result.columns.map((c) => (
                            <td key={c} style={{ ...mono, fontSize: 10.5,
                              padding: '3px 10px 3px 0' }}>
                              {String(r[c] ?? '')}</td>))}
                        </tr>))}
                    </tbody>
                  </table>)}
              </div>)}
            {ans.error && <div style={{ padding: '10px 13px',
              color: T.danger, fontSize: 11.5 }}>{ans.error}</div>}
          </Panel>)}
      </div>
    </div>);
}

/* =========================== CONSOLE =========================== */
function ConsoleTab({ envId, sys }) {
  const [colls, setColls] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [openColl, setOpenColl] = useState(null);
  const [req, setReq] = useState({ method: 'GET', url: '', params: '{}',
    headers: '{}', body: '', tests: 'status == 200\ntime < 2000' });
  const [resp, setResp] = useState(null);
  const [hist, setHist] = useState([]);
  const [busy, setBusy] = useState(false);
  const [runRes, setRunRes] = useState(null);
  const refresh = () => {
    api.aconCollections().then((d) => setColls(d.collections || []));
    api.aconHistory().then((d) => setHist(d.history || []));
  };
  useEffect(() => { refresh(); }, []);
  const openC = (c) => {
    setOpenColl(c);
    api.aconCollRequests(c.coll_id).then((d) => setReqs(d.requests || []));
  };
  const pick = (r) => setReq({ method: r.method, url: r.url_tmpl,
    params: r.params_json || '{}', headers: r.headers_json || '{}',
    body: '', tests: (JSON.parse(r.tests_json || '[]')).join('\n'),
    req_id: r.req_id, endpoint_key: r.endpoint_key });
  const send = () => {
    setBusy(true); setResp(null);
    let p = {}; let h = {};
    try { p = JSON.parse(req.params || '{}'); } catch (e) { /* keep */ }
    try { h = JSON.parse(req.headers || '{}'); } catch (e) { /* keep */ }
    api.aconExecute({ env_id: envId, method: req.method, url: req.url,
      params: p, headers: h, body: req.body || null,
      tests: req.tests.split('\n').filter(Boolean), req_id: req.req_id,
      endpoint_key: req.endpoint_key })
      .then((r) => { setResp(r); setBusy(false); refresh(); });
  };
  const runColl = (c) => {
    setRunRes({ running: c.name });
    api.aconRunCollection(c.coll_id, envId)
      .then((r) => { setRunRes({ ...r, name: c.name }); });
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr 220px',
      gap: 12 }}>
      <Panel title="Collections">
        {colls.filter((c) => sysMatch(sys || 'ALL', c.provider_system)).map((c) => (
          <div key={c.coll_id} style={{ padding: '7px 12px',
            borderBottom: `1px solid ${T.panel2}` }}>
            <div onClick={() => openC(c)} style={{ display: 'flex', gap: 6,
              cursor: 'pointer', fontSize: 12,
              fontWeight: openColl?.coll_id === c.coll_id ? 700 : 400 }}>
              <span>{c.name}</span>
              <Chip tone="grey">{c.provider_system || 'SEI'} · {c.source} · {c.n_requests}</Chip>
            </div>
            {openColl?.coll_id === c.coll_id && (
              <>
                {reqs.filter((r) => sysMatch(sys || 'ALL', r.provider_system)).map((r) => (
                  <div key={r.req_id} onClick={() => pick(r)}
                    style={{ display: 'flex', gap: 6, padding: '3px 0 3px 8px',
                      cursor: 'pointer', alignItems: 'center' }}>
                    <Chip tone={mchip(r.method)}>{r.method}</Chip>
                    <span style={{ ...mono, fontSize: 9.5, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}</span>
                  </div>))}
                <div style={{ paddingTop: 4 }}>
                  <Btn onClick={() => runColl(c)}>▶ run collection</Btn>
                </div>
              </>)}
          </div>))}
      </Panel>
      <div>
        <Panel title="Request">
          <div style={{ display: 'flex', gap: 8, padding: '9px 12px' }}>
            <select value={req.method} style={{ ...inp, ...mono,
              fontWeight: 700 }}
              onChange={(e) => setReq({ ...req, method: e.target.value })}>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m}>{m}</option>))}
            </select>
            <input style={{ ...inp, ...mono, flex: 1 }} value={req.url}
              placeholder="{{baseUrl}}/wealth/v2/accounts/{{accountId}}"
              onChange={(e) => setReq({ ...req, url: e.target.value })} />
            <Btn primary onClick={send} disabled={busy}>
              {busy ? '…' : 'Send ▶'}</Btn>
            <Btn onClick={() => {
              let p = {}; let h = {};
              try { p = JSON.parse(req.params || '{}'); } catch (e) {}
              try { h = JSON.parse(req.headers || '{}'); } catch (e) {}
              api.aconSaveRequest({ name: `${req.method} ${req.url
                .split('/').slice(-2).join('/')}`.slice(0, 120),
                method: req.method, url: req.url, params: p, headers: h,
                body: req.body || null,
                tests: req.tests.split('\n').filter(Boolean) })
                .then(() => refresh());
            }}>Save</Btn>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8, padding: '0 12px 10px' }}>
            {['params', 'headers', 'tests'].map((k) => (
              <div key={k}>
                <Lbl>{k}</Lbl>
                <textarea rows={3} value={req[k]}
                  onChange={(e) => setReq({ ...req, [k]: e.target.value })}
                  style={{ width: '100%', ...mono, fontSize: 10,
                    border: `1px solid ${T.panel2}`, borderRadius: 2 }} />
              </div>))}
          </div>
        </Panel>
        {resp && (
          <Panel title="Response" hint={resp.contract
            ? `validated vs ${resp.contract}` : ''}>
            <div style={{ display: 'flex', gap: 12, padding: '8px 12px',
              ...mono, fontSize: 11, borderBottom:
                `1px solid ${T.panel2}`, alignItems: 'center' }}>
              <b style={{ color: resp.error || resp.status >= 400
                ? T.danger : T.success, fontSize: 12.5 }}>
                {resp.error ? 'ERROR' : resp.status}</b>
              <span>{resp.elapsed_ms} ms</span>
              {resp.bytes != null && <span>{resp.bytes} B</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                {resp.schema_ok === 'Y' && <Chip tone="green">SCHEMA ✓</Chip>}
                {resp.schema_ok === 'N' && <Chip tone="red">SCHEMA ✗</Chip>}
                {(resp.tests || []).length > 0 && (
                  <Chip tone={resp.tests.every((t) => t.ok)
                    ? 'green' : 'red'}>
                    TESTS {resp.tests.filter((t) => t.ok).length}/
                    {resp.tests.length}</Chip>)}
              </span>
            </div>
            <pre style={{ margin: 0, background: '#0f1c33',
              color: '#9fd0a8', ...mono, fontSize: 10.5,
              padding: '10px 12px', maxHeight: 300, overflow: 'auto' }}>
              {resp.error || JSON.stringify(resp.body, null, 2)}</pre>
            {(resp.schema_notes || []).map((n, i) => (
              <div key={i} style={{ padding: '4px 12px', fontSize: 10.5,
                color: T.warning }}>⚠ {n}</div>))}
          </Panel>)}
        {runRes && (
          <Panel title={`Collection run · ${runRes.name || ''}`}>
            {runRes.running && <div style={{ padding: '9px 12px',
              fontSize: 11.5, color: T.sub }}>running…</div>}
            {(runRes.results || []).map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8,
                padding: '4px 12px', fontSize: 11,
                borderBottom: `1px solid ${T.panel2}` }}>
                <Chip tone={r.ok ? 'green' : 'red'}>{r.ok ? '✓' : '✗'}</Chip>
                <span style={{ ...mono, fontSize: 10.5 }}>{r.name}</span>
                <span style={{ color: T.sub }}>{r.status} ·
                  {r.elapsed_ms}ms {r.error || (r.notes || []).join(' ')}
                </span>
              </div>))}
          </Panel>)}
      </div>
      <Panel title="History" hint="evidence-logged">
        {hist.map((h, i) => (
          <div key={i} style={{ padding: '6px 11px',
            borderBottom: `1px solid ${T.panel2}` }}>
            <div style={{ display: 'flex', gap: 6, ...mono, fontSize: 9.5 }}>
              <Chip tone={mchip(h.method)}>{h.method}</Chip>
              <b style={{ color: h.status_code >= 400 || !h.status_code
                ? T.danger : T.success }}>{h.status_code || 'ERR'}</b>
              <span style={{ color: T.sub }}>{h.elapsed_ms}ms ·
                {h.ran_at}</span>
            </div>
            <div style={{ ...mono, fontSize: 9, color: T.sub,
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' }}>{h.url_final}</div>
          </div>))}
      </Panel>
    </div>);
}

/* ======================= ENVIRONMENTS ======================= */
function EnvTab({ envs, refresh }) {
  const [form, setForm] = useState(null);
  const save = () => {
    api.aconSaveEnv(form).then(() => { setForm(null); refresh(); });
  };
  return (
    <div>
      <Panel title={`Environments · ${envs.length}`}
        right={<Btn primary onClick={() => setForm({ name: '',
          vars: [{ name: 'baseUrl', value: '', kind: 'PLAIN' }] })}>
          + New</Btn>}>
        {envs.map((e) => (
          <div key={e.env_id} style={{ display: 'flex', gap: 10,
            padding: '8px 13px', borderBottom: `1px solid ${T.panel2}`,
            alignItems: 'center' }}>
            <b style={{ fontSize: 12.5 }}>{e.name}</b>
            <span style={{ ...mono, fontSize: 10, color: T.sub }}>
              {(e.vars || []).map((v) => v.name).join(' · ')}</span>
            {e.enabled === 'N' && <Chip tone="grey">disabled</Chip>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <Btn onClick={() => api.aconSetEnvEnabled(e.env_id,
                e.enabled === 'N' ? 'Y' : 'N').then(refresh)}>
                {e.enabled === 'N' ? 'enable' : 'disable'}</Btn>
              <Btn onClick={() => setForm({ env_id: e.env_id, name: e.name,
                vars: e.vars.map((v) => ({ ...v, kind:
                  v.value?.includes('\u25cf') ? 'SECRET' : 'PLAIN' })) })}>
                edit</Btn></span>
          </div>))}
      </Panel>
      {form && (
        <Panel title={form.env_id ? `Edit · ${form.name}`
          : 'New environment'}
          hint="secrets write-only — enter once or use env:VAR reference">
          <div style={{ padding: '10px 13px' }}>
            <Lbl>Name</Lbl>
            <input style={{ ...inp, width: 260, marginBottom: 9 }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {form.vars.map((v, i) => (
              <div key={i} style={{ display: 'flex', gap: 7,
                marginBottom: 5 }}>
                <input style={{ ...inp, ...mono, width: 150 }}
                  placeholder="name" value={v.name}
                  onChange={(e) => { const vs = [...form.vars];
                    vs[i] = { ...v, name: e.target.value };
                    setForm({ ...form, vars: vs }); }} />
                <input style={{ ...inp, ...mono, flex: 1 }}
                  placeholder={v.kind === 'SECRET'
                    ? 'secret or env:VARNAME' : 'value'}
                  type={v.kind === 'SECRET' ? 'password' : 'text'}
                  value={v.value || ''}
                  onChange={(e) => { const vs = [...form.vars];
                    vs[i] = { ...v, value: e.target.value };
                    setForm({ ...form, vars: vs }); }} />
                <select value={v.kind} style={inp}
                  onChange={(e) => { const vs = [...form.vars];
                    vs[i] = { ...v, kind: e.target.value };
                    setForm({ ...form, vars: vs }); }}>
                  <option>PLAIN</option><option>SECRET</option>
                </select>
              </div>))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Btn onClick={() => setForm({ ...form,
                vars: [...form.vars, { name: '', value: '',
                  kind: 'PLAIN' }] })}>+ variable</Btn>
              <Btn primary onClick={save}>Save</Btn>
              <Btn onClick={() => setForm(null)}>Cancel</Btn>
            </div>
            <div style={{ fontSize: 10, color: T.sub, marginTop: 8 }}>
              <b>Connection</b>: baseUrl, tokenUrl, clientId, clientSecret
              (SECRET) — the engine mints {'{{token}}'} automatically.
              <br /><b>Test data</b>: testAccountId etc — synthetic or
              approved accounts only, never real client numbers.
              testAccountId fills {'{{accountId}}'} in unattended runs;
              user input overrides.
            </div>
          </div>
        </Panel>)}
    </div>);
}

/* ========================= CONTRACTS ========================= */
function DecodeEditor() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ decode_set: 'RESTRICTION_CODES',
    code: '', meaning: '' });
  const refresh = () => api.aconDecodes().then((d) =>
    setRows(d.decodes || []));
  useEffect(() => { refresh(); }, []);
  return (
    <div>
      {rows.slice(0, 12).map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8,
          padding: '4px 13px', fontSize: 11,
          borderBottom: `1px solid ${T.panel2}` }}>
          <Chip tone="grey">{r.decode_set}</Chip>
          <span style={{ ...mono, fontSize: 10.5, width: 60 }}>{r.code}</span>
          <span>{r.meaning}</span>
        </div>))}
      <div style={{ display: 'flex', gap: 6, padding: '7px 13px',
        alignItems: 'center' }}>
        <input style={{ ...inp, ...mono, width: 160, fontSize: 10 }}
          value={form.decode_set}
          onChange={(e) => setForm({ ...form,
            decode_set: e.target.value.toUpperCase() })} />
        <input style={{ ...inp, ...mono, width: 70, fontSize: 10 }}
          placeholder="code" value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <input style={{ ...inp, flex: 1, fontSize: 11 }}
          placeholder="meaning" value={form.meaning}
          onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
        <Btn primary onClick={() => api.aconSaveDecode(form)
          .then(() => { setForm({ ...form, code: '', meaning: '' });
            refresh(); })}>Add</Btn>
      </div>
    </div>);
}

function CatalogTab({ sys, preSystem }) {
  const [systems, setSystems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [upl, setUpl] = useState({ system: preSystem || 'sei',
    domain: '', filename: '', content: '' });
  const [msg, setMsg] = useState('');
  const [versions, setVersions] = useState(null);
  const [diff, setDiff] = useState(null);
  const code = (preSystem || (sys === 'ALL' ? 'all' : sys)).toLowerCase();
  const refresh = () => {
    api.acatSystems().then((d) => setSystems(d.systems || []));
    api.aconAdminSystem(code === 'all' ? 'sei' : code).then(setDetail);
  };
  useEffect(() => { refresh(); }, [code]);
  const upload = () => {
    setMsg('writing into the artifacts tree…');
    api.acatUpload(upl).then((r) => {
      if (r.error) { setMsg(`✗ ${r.error}`); return; }
      setMsg(`✓ ${r.placed} → connector ran → `
        + (r.drift_status === 'DRIFT'
          ? `DRIFT: ${r.drift_note}` : 'no breaking changes'));
      refresh();
    });
  };
  const sources = detail?.sources || [];
  return (
    <div>
      <div style={{ background: '#eaf2fa', border: '1px solid #b9d0e8',
        borderRadius: 3, padding: '8px 13px', fontSize: 11.5,
        color: T.accent, marginBottom: 12 }}>
        <b>One catalog, one pipeline.</b> Ingestion is the API 360 connector
        over the artifacts tree. Upload here writes into that same tree —
        folder scan and UI upload can never diverge.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 12 }}>
        <Panel title="Systems · from the catalog itself"
          hint="DISTINCT project_id + resolver — no registry table">
          {systems.map((x) => (
            <div key={x.code} style={{ display: 'flex', gap: 8,
              padding: '6px 13px', fontSize: 11.5, alignItems: 'center',
              borderBottom: `1px solid ${T.panel2}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%',
                background: SYS_COLORS[x.code] || T.accent }} />
              <b style={{ ...mono, fontSize: 11 }}>{x.code}</b>
              <Chip tone={x.sources ? 'green' : 'grey'}>
                {x.sources} sources</Chip>
              {x.drift > 0 && <Chip tone="red">{x.drift} drift</Chip>}
            </div>))}
          <div style={{ padding: '7px 13px', fontSize: 10, color: T.sub }}>
            new system = new folder under the tree (+ one _SYSTEM_MAP line
            for fuzzy names)</div>
        </Panel>
        <Panel title="Upload swagger · writes into the artifacts tree"
          hint="then runs the SAME connector on that one file">
          <div style={{ padding: '10px 13px', display: 'flex', gap: 8,
            flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><Lbl>System</Lbl>
              <select style={{ ...inp, width: 130 }} value={upl.system}
                onChange={(e) => setUpl({ ...upl, system: e.target.value })}>
                {['sei', 'internal', 'addvantage', 'charles_river',
                  'pivotal', 'bloomberg'].map((x) =>
                  <option key={x}>{x}</option>)}
              </select></div>
            <div><Lbl>Domain / feature group</Lbl>
              <input style={{ ...inp, width: 210 }} value={upl.domain}
                placeholder="PortfolioandModelManagement"
                onChange={(e) => setUpl({ ...upl, domain: e.target.value })}
              /></div>
            <div><Lbl>Filename</Lbl>
              <input style={{ ...inp, width: 180 }} value={upl.filename}
                placeholder="swagger-spec-Foo.yaml"
                onChange={(e) => setUpl({ ...upl,
                  filename: e.target.value })} /></div>
            <Btn primary onClick={upload}
              disabled={!upl.domain || !upl.content}>⬆ Upload &amp; ingest
            </Btn>
          </div>
          <div style={{ padding: '0 13px 8px' }}>
            <Lbl>Spec content (paste, or picked file below)</Lbl>
            <textarea style={{ ...inp, ...mono, width: '100%', height: 70,
              fontSize: 10, padding: 8 }} value={upl.content}
              onChange={(e) => setUpl({ ...upl, content: e.target.value })}
            />
            <input type="file" accept=".json,.yaml,.yml"
              style={{ fontSize: 11, marginTop: 4 }}
              onChange={(e) => {
                const f = e.target.files[0];
                if (!f) return;
                f.text().then((txt) => setUpl({ ...upl, content: txt,
                  filename: upl.filename || f.name }));
              }} />
          </div>
          <div style={{ padding: '7px 13px',
            borderTop: `1px solid ${T.panel2}`, display: 'flex', gap: 8,
            alignItems: 'center' }}>
            <Btn onClick={() => { setMsg('tree scan started…');
              api.acatScan().then((r) => setMsg(r.error
                ? `✗ ${r.error}`
                : `✓ scanned: ${r.sources} sources, ${r.endpoints} endpoints`));
            }}>⟳ Scan folder now</Btn>
            <span style={{ fontSize: 10.5, color: T.sub }}>
              idempotent re-ingest of the whole tree · your scheduled job
            </span>
          </div>
          {msg && <div style={{ padding: '6px 13px', fontSize: 11,
            color: msg.startsWith('✗') ? T.danger : T.success }}>{msg}</div>}
        </Panel>
      </div>
      <Panel title="Sources · api_sources with version history"
        hint="drift lives on the source row · acknowledge once triaged">
        {sources.map((c) => (
          <div key={c.source_id} style={{ display: 'flex', gap: 8,
            padding: '6px 13px', fontSize: 11.5, alignItems: 'center',
            borderBottom: `1px solid ${T.panel2}`, flexWrap: 'wrap' }}>
            <b>{c.source_id}</b>
            <Chip tone="grey">{c.feature_group}</Chip>
            <span style={{ ...mono, fontSize: 10 }}>
              v{c.release_version} · {c.endpoint_count} eps</span>
            <Chip tone={c.drift_status === 'DRIFT' ? 'red' : 'green'}>
              {c.drift_status}</Chip>
            {c.drift_status === 'DRIFT' && (
              <span style={{ fontSize: 10.5, color: T.danger }}>
                {c.drift_note}</span>)}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
              <Btn onClick={() => { setDiff(null);
                api.acatVersions(c.source_id).then((d) =>
                  setVersions({ sid: c.source_id,
                    list: d.versions || [] })); }}>versions</Btn>
              {c.drift_status === 'DRIFT' && !c.drift_ack_by && (
                <Btn onClick={() => api.acatAckDrift(c.source_id)
                  .then(refresh)}>Acknowledge</Btn>)}
            </span>
          </div>))}
        {!sources.length && <div style={{ padding: '12px 13px',
          fontSize: 11.5, color: T.sub }}>No sources for this system yet —
          upload a spec above or drop files in the folder and scan.</div>}
      </Panel>
      {versions && (
        <Panel title={`Versions · ${versions.sid}`}
          right={<Btn onClick={() => { setVersions(null); setDiff(null); }}>
            close</Btn>}>
          {versions.list.map((v) => (
            <div key={v.version_no} style={{ display: 'flex', gap: 8,
              padding: '5px 13px', fontSize: 11,
              borderBottom: `1px solid ${T.panel2}`,
              alignItems: 'center' }}>
              <b>v{v.version_no}</b>
              <span style={{ ...mono, fontSize: 10 }}>
                {v.release_version}</span>
              <span style={{ fontSize: 10, color: T.sub }}>
                {v.ingested_at}</span>
              {v.breaking_ct > 0 && <Chip tone="red">
                {v.breaking_ct} breaking</Chip>}
              {v.additive_ct > 0 && <Chip tone="amber">
                {v.additive_ct} additive</Chip>}
              <span style={{ marginLeft: 'auto' }}>
                <Btn onClick={() => api.acatDiff(versions.sid, v.version_no)
                  .then(setDiff)}>diff</Btn></span>
            </div>))}
          {diff && (
            <div style={{ padding: '8px 13px', fontSize: 11 }}>
              {(diff.breaking || []).map((x, i) => (
                <div key={i} style={{ color: T.danger }}>BREAKING · {x}
                </div>))}
              {(diff.additive || []).map((x, i) => (
                <div key={i} style={{ color: '#e67e22' }}>ADDITIVE · {x}
                </div>))}
              {!(diff.breaking || []).length
                && !(diff.additive || []).length && (
                <span style={{ color: T.sub }}>no field-level changes</span>)}
            </div>)}
        </Panel>)}
      <Panel title="Answer decodes"
        hint="code → meaning tables Guided answers join against">
        <DecodeEditor />
      </Panel>
    </div>);
}

function BuilderTab({ sys }) {
  const [colls, setColls] = useState([]);
  const [schedEdit, setSchedEdit] = useState({});
  const [reqs, setReqs] = useState([]);
  const [picked, setPicked] = useState({});
  const [name, setName] = useState('Ops · Parallel-Run Daily Checks');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [sugs, setSugs] = useState([]);
  const [travels, setTravels] = useState([]);
  const sysParam = (sys || 'ALL').toLowerCase() === 'all'
    ? null : (sys || '').toLowerCase();
  useEffect(() => {
    api.aconCollections().then((d) => setColls(d.collections || []));
    api.acatEndpoints(sysParam).then((d) => setReqs(d.endpoints || []));
  }, [sysParam]);
  useEffect(() => {
    if (q.length < 2) { setSugs([]); return; }
    const t = setTimeout(() => api.acatSuggest(q, sysParam)
      .then((d) => setSugs(d.suggestions || [])), 200);
    return () => clearTimeout(t);
  }, [q, sysParam]);
  const pickedKeys = () => Object.keys(picked).filter((k) => picked[k]);
  useEffect(() => {
    const ks = pickedKeys();
    if (!ks.length) { setTravels([]); return; }
    api.acatSuggestNext(ks[ks.length - 1], ks.join(','))
      .then((d) => setTravels((d.next || []).slice(0, 4)));
  }, [picked]);
  const ids = Object.keys(picked).filter((k) => picked[k]);
  const create = () => {
    api.aconBuildCollection({ name,
      endpoints: ids.map((k) => {
        const e = reqs.find((r) => r.endpoint_key === k) || {};
        return { endpoint_key: k, method: e.method,
          name: e.operation_id || e.path, url: e.full_endpoint_url
            || e.path };
      }) })
      .then((r) => setMsg(r.ok ? `created ✓ (${ids.length} requests)`
        : r.error));
  };
  const exportPm = () => {
    api.aconBuildCollection({ name,
      endpoints: ids.map((k) => {
        const e = reqs.find((r) => r.endpoint_key === k) || {};
        return { endpoint_key: k, method: e.method,
          name: e.operation_id || e.path, url: e.full_endpoint_url
            || e.path };
      }) }).then((r) => {
      if (!r.ok) { setMsg(r.error); return; }
      api.aconExportPostman(r.coll_id).then((pm) => {
        const blob = new Blob([JSON.stringify(pm, null, 2)],
          { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${name.replace(/\W+/g, '_')}.postman_collection.json`;
        a.click();
        setMsg('exported ✓ — secrets are never included');
      });
    });
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px',
      gap: 12 }}>
      <Panel title="Pick endpoints · from api_endpoints"
        hint="typeahead: opId prefix › summary › path">
        <div style={{ padding: '8px 12px',
          borderBottom: `1px solid ${T.panel2}`, position: 'relative' }}>
          <input style={{ ...inp, width: '100%' }} value={q}
            placeholder="search endpoints… e.g. restriction, balance"
            onChange={(e) => setQ(e.target.value)} />
          {!!sugs.length && (
            <div style={{ position: 'absolute', left: 12, right: 12,
              background: '#fff', border: `1px solid ${T.panel2}`,
              boxShadow: '0 4px 8px rgba(0,0,0,.12)', zIndex: 5 }}>
              {sugs.map((g) => (
                <div key={g.endpoint_key}
                  onClick={() => { setPicked({ ...picked,
                    [g.endpoint_key]: true }); setQ(''); }}
                  style={{ display: 'flex', gap: 7, padding: '5px 10px',
                    fontSize: 11, cursor: 'pointer',
                    alignItems: 'center' }}>
                  <Chip tone={mchip(g.method)}>{g.method}</Chip>
                  <b>{g.operation_id || g.path}</b>
                  <span style={{ ...mono, fontSize: 9.5, color: T.sub }}>
                    {g.path}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9,
                    color: T.sub }}>{g.feature_group}</span>
                </div>))}
            </div>)}
        </div>
        {!!travels.length && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center',
            padding: '6px 12px', borderBottom: `1px solid ${T.panel2}`,
            flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700,
              textTransform: 'uppercase', color: T.sub }}>
              travels with:</span>
            {travels.map((x) => (
              <span key={x.endpoint_key}
                onClick={() => setPicked({ ...picked,
                  [x.endpoint_key]: true })}
                style={{ cursor: 'pointer' }}>
                <Chip tone="grey">＋ {x.endpoint_key.split(' ').pop()
                  .split('/').filter(Boolean).pop()}</Chip></span>))}
            <span style={{ fontSize: 9, color: T.sub }}>
              from api_dependencies</span>
          </div>)}
        {reqs.map((r) => (
          <div key={r.endpoint_key} style={{ display: 'flex', gap: 8,
            padding: '5px 13px', borderBottom: `1px solid ${T.panel2}`,
            alignItems: 'center' }}>
            <input type="checkbox" checked={!!picked[r.endpoint_key]}
              onChange={(e) => setPicked({ ...picked,
                [r.endpoint_key]: e.target.checked })} />
            <Chip tone={mchip(r.method)}>{r.method}</Chip>
            <span style={{ ...mono, fontSize: 10.5 }}>
              {r.operation_id || r.path}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5,
              color: T.sub }}>{r.feature_group}</span>
          </div>))}
      </Panel>
      <div>
      <Panel title={`New collection · ${ids.length} picked`}>
        <div style={{ padding: '10px 13px', display: 'flex',
          flexDirection: 'column', gap: 8 }}>
          <Lbl>Collection name</Lbl>
          <input style={inp} value={name}
            onChange={(e) => setName(e.target.value)} />
          <Btn primary onClick={create} disabled={!ids.length}>
            Create in Console</Btn>
          <Btn onClick={exportPm} disabled={!ids.length}>
            ⬇ Export .postman_collection.json</Btn>
          <span style={{ fontSize: 10.5, color: msg.includes('✓')
            ? T.success : T.danger }}>{msg}</span>
          <span style={{ fontSize: 10, color: T.sub }}>
            Exports carry variables and auth structure only — secrets stay
            in CP 360.</span>
        </div>
      </Panel>
      <Panel title="Manage collections"
        hint="schedule feeds the CronJob runner · AUTO are contract-owned">
        {colls.map((c) => (
          <div key={c.coll_id} style={{ display: 'flex', gap: 7,
            padding: '6px 12px', fontSize: 11.5,
            borderBottom: `1px solid ${T.panel2}`,
            alignItems: 'center' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', maxWidth: 130 }}>{c.name}</span>
            <Chip tone="grey">{c.source}</Chip>
            <input style={{ ...inp, ...mono, width: 78, height: 24,
              fontSize: 10 }} placeholder="tag"
              value={schedEdit[c.coll_id] ?? c.schedule_tag ?? ''}
              onChange={(e) => setSchedEdit({ ...schedEdit,
                [c.coll_id]: e.target.value })} />
            <Btn onClick={() => api.aconSetSchedule(c.coll_id,
              schedEdit[c.coll_id] ?? c.schedule_tag ?? '')
              .then(() => setMsg('schedule saved ✓'))}>set</Btn>
            {c.source !== 'AUTO' && (
              <Btn onClick={() => {
                if (window.confirm(`Delete collection ${c.name}?`)) {
                  api.aconDeleteCollection(c.coll_id).then(() =>
                    api.aconCollections().then((d) =>
                      setColls(d.collections || [])));
                }
              }}>✕</Btn>)}
          </div>))}
      </Panel>
      </div>
    </div>);
}

/* ========================= FLOW BUILDER ========================= */
function FlowBuilderTab({ envId }) {
  const [flows, setFlows] = useState([]);
  const [f, setF] = useState(null);           // loaded flow w/ bindings
  const [test, setTest] = useState(null);
  const [msg, setMsg] = useState('');
  const [sug, setSug] = useState(null);
  const [signed, setSigned] = useState(false);
  const refresh = () => api.aconFlows().then((d) =>
    setFlows(d.flows || []));
  useEffect(() => { refresh(); }, []);
  const open = (flowId) => {
    setMsg(''); setTest(null); setSug(null); setSigned(false);
    api.aconFlow(flowId).then((det) => {
      setF(det);
      const last = (det.steps || [])[det.steps.length - 1];
      if (last) {
        api.acatSuggestNext(last.endpoint_key,
          (det.steps || []).map((x) => x.endpoint_key).join(','))
          .then(setSug);
      }
    });
  };
  const setStep = (i2, k, v) => {
    const st = [...f.steps]; st[i2] = { ...st[i2], [k]: v };
    setF({ ...f, steps: st });
  };
  const saveBindings = () => {
    api.aconSaveBindings(f.flow_id, {
      inputs: f.inputs || [], present: f.present,
      reviewed: true, signed_off: signed,
      steps: (f.steps || []).map((st) => ({
        step_order: st.step_order, params: st.params || {},
        body: st.body || null, extract: st.extract || {},
        foreach: st.foreach || null })),
    }).then((r) => {
      if (r.requires_signoff) {
        setMsg('⚠ flow contains write operations — tick the sign-off box');
      } else {
        setMsg(r.ok ? 'bindings saved ✓ — flow is now runnable' : r.error);
        refresh();
      }
    });
  };
  const testRun = () => {
    const inputs = {};
    (f.inputs || []).forEach((x) => { inputs[x.name] = x.example || ''; });
    setTest({ running: true });
    api.aconFlowRun(f.flow_id, { env_id: envId, inputs }).then(setTest);
  };
  const publish = (pub) => {
    api.acatPublishFlow(f.flow_id, pub).then(() => {
      setMsg(pub ? 'published ✓ — tile visible in Guided' : 'unpublished');
      refresh();
    });
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px',
      gap: 12 }}>
      <div>
        <Panel title="Flows · api_business_flows"
          hint="generator drafts · BAs curate · bindings make them runnable">
          {flows.map((x) => (
            <div key={x.flow_id} style={{ display: 'flex', gap: 8,
              padding: '7px 13px', borderBottom: `1px solid ${T.panel2}`,
              alignItems: 'center', cursor: 'pointer' }}
              onClick={() => open(x.flow_id)}>
              <b style={{ fontSize: 12 }}>{x.name}</b>
              <Chip tone="grey">{x.origin}</Chip>
              {x.is_published === 'Y' && <Chip tone="green">PUBLISHED</Chip>}
              <Chip tone={x.runnable === 'Y' ? 'green' : 'amber'}>
                {x.runnable === 'Y' ? 'runnable' : 'docs-only'}</Chip>
              <span style={{ marginLeft: 'auto', fontSize: 10,
                color: T.sub }}>{x.domain} · {x.step_count} steps</span>
            </div>))}
          {!flows.length && <div style={{ padding: '12px 13px',
            fontSize: 11.5, color: T.sub }}>No flows yet — the generator
            creates them on ingest; BAs add more in API 360.</div>}
        </Panel>
        {f && (
          <Panel title={`Bindings · ${f.name}`}
            hint="params · extract · fan-out — what makes it runnable">
            <div style={{ padding: '8px 13px' }}>
              <Lbl>Inputs (asked of the Guided user)</Lbl>
              {(f.inputs || []).map((x, i2) => (
                <div key={i2} style={{ display: 'flex', gap: 6,
                  marginBottom: 4 }}>
                  <input style={{ ...inp, ...mono, width: 120,
                    fontSize: 10.5 }} value={x.name}
                    onChange={(e) => {
                      const v = [...f.inputs];
                      v[i2] = { ...v[i2], name: e.target.value };
                      setF({ ...f, inputs: v }); }} />
                  <input style={{ ...inp, flex: 1, fontSize: 11 }}
                    placeholder="label" value={x.label || ''}
                    onChange={(e) => {
                      const v = [...f.inputs];
                      v[i2] = { ...v[i2], label: e.target.value };
                      setF({ ...f, inputs: v }); }} />
                  <input style={{ ...inp, ...mono, width: 90,
                    fontSize: 10.5 }} placeholder="example"
                    value={x.example || ''}
                    onChange={(e) => {
                      const v = [...f.inputs];
                      v[i2] = { ...v[i2], example: e.target.value };
                      setF({ ...f, inputs: v }); }} />
                </div>))}
              <Btn onClick={() => setF({ ...f,
                inputs: [...(f.inputs || []), { name: '', label: '' }] })}>
                + input</Btn>
            </div>
            {(f.steps || []).map((st, i2) => (
              <div key={i2} style={{ padding: '8px 13px',
                borderTop: `1px solid ${T.panel2}` }}>
                <div style={{ display: 'flex', gap: 7,
                  alignItems: 'center', marginBottom: 5 }}>
                  <b style={{ fontSize: 11 }}>STEP {st.step_order}</b>
                  <Chip tone={mchip(st.method)}>{st.method}</Chip>
                  <span style={{ ...mono, fontSize: 10 }}>{st.path}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input style={{ ...inp, ...mono, width: 240,
                    fontSize: 10 }}
                    placeholder='params {"office":"{{input.officeCode}}"}'
                    value={JSON.stringify(st.params || {})}
                    onChange={(e) => { try {
                      setStep(i2, 'params', JSON.parse(e.target.value));
                    } catch { /* typing */ } }} />
                  <input style={{ ...inp, ...mono, width: 240,
                    fontSize: 10 }}
                    placeholder='extract {"accts":"items[].id"}'
                    value={JSON.stringify(st.extract || {})}
                    onChange={(e) => { try {
                      setStep(i2, 'extract', JSON.parse(e.target.value));
                    } catch { /* typing */ } }} />
                  <input style={{ ...inp, ...mono, width: 150,
                    fontSize: 10 }} placeholder="foreach {{each.accts}}"
                    value={st.foreach || ''}
                    onChange={(e) => setStep(i2, 'foreach',
                      e.target.value)} />
                </div>
              </div>))}
            <div style={{ padding: '9px 13px',
              borderTop: `1px solid ${T.panel2}`, display: 'flex', gap: 8,
              alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn primary onClick={saveBindings}>Save bindings</Btn>
              <Btn onClick={testRun}>▶ Test</Btn>
              {f.published
                ? <Btn onClick={() => publish(false)}>Unpublish</Btn>
                : <Btn onClick={() => publish(true)}>Publish</Btn>}
              <label style={{ fontSize: 10.5, display: 'flex', gap: 5,
                alignItems: 'center' }}>
                <input type="checkbox" checked={signed}
                  onChange={(e) => setSigned(e.target.checked)} />
                sign-off (required for POST/PUT flows)</label>
              {msg && <span style={{ fontSize: 11,
                color: msg.startsWith('⚠') ? '#e67e22' : T.success }}>
                {msg}</span>}
            </div>
          </Panel>)}
      </div>
      <div>
        {sug && (
          <Panel title="Suggest next step"
            hint="from api_dependencies">
            {(sug.next || []).map((x) => (
              <div key={x.endpoint_key} style={{ padding: '6px 13px',
                fontSize: 11, borderBottom: `1px solid ${T.panel2}` }}>
                <b>{x.endpoint_key}</b>
                <div style={{ fontSize: 9.5, color: T.sub }}>
                  consumes {x.needs.join(', ')}</div>
              </div>))}
            {(sug.warnings || []).map((w, i2) => (
              <div key={i2} style={{ margin: '6px 12px', padding: '6px 9px',
                background: '#fdf3e7', borderRadius: 3, fontSize: 10.5,
                color: '#b9770e' }}>
                ⚠ {w.endpoint_key.split(' ').pop()} needs
                <b> {w.missing_entity}</b> — nothing earlier produces it
                {w.producer && <span> · producer: {w.producer}</span>}
              </div>))}
            {sug.note && <div style={{ padding: '8px 13px', fontSize: 10.5,
              color: T.sub }}>{sug.note}</div>}
            {!((sug.next || []).length) && !sug.note
              && !((sug.warnings || []).length) && (
              <div style={{ padding: '8px 13px', fontSize: 10.5,
                color: T.sub }}>no further consumers of these step
                outputs</div>)}
          </Panel>)}
        {test && (
          <Panel title="Test run">
            {test.running && <div style={{ padding: '10px 13px',
              fontSize: 11.5 }}>running…</div>}
            {test.error && <div style={{ padding: '10px 13px',
              fontSize: 11.5, color: T.danger }}>{test.error}</div>}
            {(test.steps || []).map((st) => (
              <div key={st.step_order} style={{ padding: '6px 13px',
                fontSize: 11, borderBottom: `1px solid ${T.panel2}` }}>
                step {st.step_order}: {st.ok}/{st.count} ok
                {st.last_status && <span style={{ ...mono, fontSize: 10,
                  marginLeft: 6 }}>HTTP {st.last_status}</span>}
              </div>))}
            {test.presented && (
              <div style={{ padding: '8px 13px', fontSize: 10.5,
                color: T.sub }}>
                presented: {test.presented.rows?.length || 0} rows ·
                {' '}{test.presented.summary}</div>)}
          </Panel>)}
      </div>
    </div>);
}

function AdminTab({ goIngest }) {
  const [systems, setSystems] = useState([]);
  const [code, setCode] = useState(null);
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const [envRes, setEnvRes] = useState({});
  const [envsA, setEnvsA] = useState([]);
  const [collsA, setCollsA] = useState([]);
  useEffect(() => {
    api.aconEnvironments().then((d) => setEnvsA(d.environments || []));
    api.aconCollections().then((d) => setCollsA(d.collections || []));
  }, []);
  useEffect(() => {
    api.acatSystems().then((r) => {
      setSystems(r.systems || []);
      if (!code && r.systems?.length) setCode(r.systems[0].code);
    });
  }, []);
  useEffect(() => {
    if (code) api.aconAdminSystem(code).then(setD);
  }, [code]);
  const M = d?.metrics || {};
  const cards = [[M.sources, 'Sources'], [M.endpoints, 'Endpoints'],
    [M.published_flows, 'Published flows'], [M.open_drift, 'Open drift'],
    [M.pass_rate_7d != null ? `${M.pass_rate_7d}%` : '—', '7-day pass']];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr',
      gap: 12 }}>
      <Panel title="Systems">
        {systems.map((x) => (
          <div key={x.code} onClick={() => setCode(x.code)}
            style={{ padding: '9px 13px', cursor: 'pointer',
              borderBottom: `1px solid ${T.panel2}`,
              background: code === x.code ? T.infoBg : undefined,
              borderLeft: code === x.code
                ? `3px solid ${T.accent}` : '3px solid transparent' }}>
            <div style={{ display: 'flex', gap: 7,
              alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%',
                background: SYS_COLORS[x.code] || T.accent }} />
              <b style={{ fontSize: 12.5 }}>{x.code}</b>
              <Chip tone={x.sources ? 'green' : 'grey'}>
                {x.sources ? 'INGESTED' : 'EMPTY'}</Chip>
            </div>
            <div style={{ fontSize: 10.5, color: T.sub }}>
              {x.sources || 0} source(s)
              {x.drift > 0 && ` · ${x.drift} drift`}</div>
          </div>))}
      </Panel>
      {d && !d.error && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center',
            marginBottom: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%',
              background: SYS_COLORS[d.code] || T.accent }} />
            <h2 style={{ fontSize: 15, margin: 0 }}>
              {SYS_LABELS[d.code] || d.code}</h2>
            <Chip tone={d.metrics?.sources ? 'green' : 'grey'}>
              {d.metrics?.sources ? 'INGESTED' : 'EMPTY'}</Chip>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
              <Btn primary onClick={() => goIngest(code)}>
                ⬆ Ingest now</Btn>
              <Btn onClick={() => api.acatScan().then(() => {
                setMsg('tree scan running — refresh shortly');
                setTimeout(() => api.aconAdminSystem(code).then(setD),
                  4000);
              })}>▶ Run sources</Btn>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {cards.map(([v, l]) => (
              <div key={l} style={{ background: T.panel,
                border: `1px solid ${T.border}`, borderRadius: 3,
                padding: '8px 13px', minWidth: 100 }}>
                <div style={{ fontSize: 19, fontWeight: 700,
                  color: l === 'Open drift' && v > 0
                    ? T.danger : T.navy }}>{v ?? 0}</div>
                <div style={{ fontSize: 9, textTransform: 'uppercase',
                  letterSpacing: '.05em', color: T.sub,
                  fontWeight: 700 }}>{l}</div>
              </div>))}
          </div>
          {msg && <div style={{ fontSize: 11, color: T.success,
            marginBottom: 8 }}>{msg}</div>}
          {d.sources.some((c) => c.drift_status === 'DRIFT'
            && !c.drift_ack_by) && (
            <Panel title="Health & attention"
              hint="unacknowledged drift — acknowledge once triaged">
              {d.sources.filter((c) => c.drift_status === 'DRIFT'
                && !c.drift_ack_by).map((c) => (
                <div key={c.source_id} style={{ display: 'flex', gap: 8,
                  padding: '6px 13px', fontSize: 11.5,
                  borderBottom: `1px solid ${T.panel2}`,
                  alignItems: 'center' }}>
                  <Chip tone="red">DRIFT</Chip>
                  <b>{c.source_id}</b>
                  <span style={{ fontSize: 10.5, color: T.danger }}>
                    {c.drift_note}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <Btn onClick={() => api.acatAckDrift(c.source_id)
                      .then(() => api.aconAdminSystem(code).then(setD))}>
                      Acknowledge</Btn></span>
                </div>))}
            </Panel>)}
          <Panel title="Sources"
            hint="the unified catalog — same rows API 360 documents">
            {d.sources.map((c) => (
              <div key={c.source_id} style={{ display: 'flex', gap: 8,
                padding: '6px 13px', fontSize: 11.5,
                borderBottom: `1px solid ${T.panel2}`,
                alignItems: 'center' }}>
                <b>{c.source_id}</b>
                <Chip tone="grey">{c.feature_group}</Chip>
                <span style={{ ...mono, fontSize: 10 }}>
                  v{c.release_version} · {c.endpoint_count} eps</span>
                <Chip tone={c.drift_status === 'DRIFT' ? 'red' : 'green'}>
                  {c.drift_status}</Chip>
              </div>))}
            {!d.sources.length && <div style={{ padding: '9px 13px',
              fontSize: 11.5, color: T.sub }}>Nothing ingested for this
              system yet — use Catalog &amp; Ingestion.</div>}
          </Panel>
          <div style={{ display: 'grid',
            gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Panel title="Environments">
              {envsA.map((e) => (
                <div key={e.env_id} style={{ display: 'flex', gap: 8,
                  padding: '6px 13px', fontSize: 12,
                  borderBottom: `1px solid ${T.panel2}`,
                  alignItems: 'center' }}>
                  <b>{e.name}</b>
                  {envRes[e.env_id] && (
                    <Chip tone={envRes[e.env_id].ok ? 'green' : 'red'}>
                      {envRes[e.env_id].ok
                        ? `reachable · ${envRes[e.env_id].elapsed_ms}ms`
                        : 'unreachable'}</Chip>)}
                  <span style={{ marginLeft: 'auto' }}>
                    <Btn onClick={() => api.aconEnvTest(e.env_id)
                      .then((r) => setEnvRes({ ...envRes,
                        [e.env_id]: r }))}>test</Btn></span>
                </div>))}
              {!envsA.length && <div style={{
                padding: '8px 13px', fontSize: 11, color: T.sub }}>
                No environments configured yet.</div>}
            </Panel>
            <Panel title="Collections">
              {collsA.map((c) => (
                <div key={c.coll_id} style={{ display: 'flex', gap: 8,
                  padding: '6px 13px', fontSize: 12,
                  borderBottom: `1px solid ${T.panel2}` }}>
                  <span>{c.name}</span>
                  <Chip tone="grey">{c.source} · {c.n_requests}</Chip>
                </div>))}
            </Panel>
          </div>
        </div>)}
    </div>);
}

/* ============================ SHELL ============================ */
const TABS = [['guided', '🧭 Guided'], ['console', '⌘ Console']];
const ADMIN_TABS = [['overview', '🗂 Overview'],
  ['contracts', '📜 Catalog & Ingestion'],
  ['env', '⚙ Environments & Tests'], ['builder', '🧺 Collection Builder'],
  ['flows', '🛠 Flow Builder']];

export default function Api360Console({ t }) {
  T = { infoBg: '#e0f5fd', info: '#0091bf', warningBg: '#fae5d3',
    mono: "'Roboto Mono', monospace", panel2: '#dfe6e9',
    navy: '#10193b', ...t };
  const [tab, setTab] = useState('guided');
  const [envs, setEnvs] = useState([]);
  const [envId, setEnvId] = useState('');
  const [sysParent, setSysParent] = useState('ALL'); // ALL|SEI|NON-SEI
  const [sysChild, setSysChild] = useState('ALL');   // within NON-SEI
  const [systems, setSystems] = useState([]);
  useEffect(() => {
    api.acatSystems().then((d) => {
      const ss = d.systems || [];
      setSystems(ss);
      SEI_SET = new Set(ss.filter((x) => x.code === 'sei')
        .map((x) => x.code.toUpperCase()));
      if (!SEI_SET.size) SEI_SET = new Set(['SEI']);
    });
  }, []);
  const sys = sysParent === 'NON-SEI'
    ? (sysChild === 'ALL' ? 'NON-SEI' : sysChild) : sysParent;
  const refreshEnvs = () => api.aconEnvironments().then((d) => {
    setEnvs(d.environments || []);
    if (!envId && d.environments?.length) {
      setEnvId(d.environments[0].env_id);
    }
  });
  useEffect(() => { refreshEnvs(); }, []);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 4 }}>
        <h1 style={{ fontSize: 19, fontWeight: 500, margin: 0 }}>
          API 360 · Console</h1>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.sub }}>
          Environment</span>
        <select value={envId} onChange={(e) => setEnvId(e.target.value)}
          style={{ height: 26, fontSize: 11.5 }}>
          {envs.filter((e) => sysMatch(sys, e.provider_system)).map((e) => (
            <option key={e.env_id} value={e.env_id}>{e.name}</option>))}
        </select>
      </div>
      <div style={{ color: T.sub, fontSize: 12.5, marginBottom: 8 }}>
        Guided answers for the business · a full console for engineers ·
        one contract-validated, PII-masked, evidence-logged platform</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center',
        marginBottom: 10 }}>
        <SystemPills value={sysParent === 'NON-SEI'
          ? (sysChild === 'ALL' ? 'non-sei' : sysChild)
          : sysParent.toLowerCase()}
          onChange={(v) => {
            if (v === 'all' || v === 'sei' || v === 'non-sei') {
              setSysParent(v.toUpperCase()); setSysChild('ALL');
            } else { setSysParent('NON-SEI'); setSysChild(v); }
          }} />
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom:
        `1px solid ${T.border}`, marginBottom: 12 }}>
        {TABS.map(([k, label]) => (
          <div key={k} onClick={() => setTab(k)}
            style={{ padding: '7px 15px', fontSize: 12.5, cursor: 'pointer',
              borderBottom: tab === k ? `2px solid ${T.pop || '#31bced'}`
                : '2px solid transparent',
              fontWeight: tab === k ? 700 : 400,
              color: tab === k ? T.navy : T.sub }}>{label}</div>))}
      </div>
      {tab === 'guided' && <GuidedTab envId={envId} />}
      {tab === 'console' && <ConsoleTab envId={envId} sys={sys} />}
    </div>);
}



function DriftBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    api.acatDriftUnread().then((d) => setN(d.unread || 0));
  }, []);
  if (!n) return null;
  return (
    <span style={{ background: '#c1113a', color: '#fff', fontSize: 10.5,
      fontWeight: 700, borderRadius: 999, padding: '2px 9px' }}>
      {n} unacknowledged drift</span>);
}

/* =================== API CATALOG ADMIN (Admin nav screen) =================== */
export function ApiCatalogAdmin({ t }) {
  T = { infoBg: '#e0f5fd', info: '#0091bf', warningBg: '#fae5d3',
    mono: "'Roboto Mono', monospace", panel2: '#dfe6e9',
    navy: '#10193b', ...t };
  const [tab, setTab] = useState('overview');
  const [ingestSys, setIngestSys] = useState(null);
  const [envs, setEnvs] = useState([]);
  const [envId, setEnvId] = useState('');
  const refreshEnvs = () => api.aconEnvironments().then((d) => {
    setEnvs(d.environments || []);
    if (!envId && d.environments?.length) {
      setEnvId(d.environments[0].env_id);
    }
  });
  useEffect(() => { refreshEnvs(); }, []);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 4 }}>
        <h1 style={{ fontSize: 19, fontWeight: 500, margin: 0 }}>
          API Catalog Admin</h1>
        <DriftBadge />
        {tab === 'flows' && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8,
            alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.sub }}>Environment</span>
            <select value={envId}
              onChange={(e) => setEnvId(e.target.value)}
              style={{ height: 26, fontSize: 11.5 }}>
              {envs.map((e) => (
                <option key={e.env_id} value={e.env_id}>{e.name}</option>))}
            </select>
          </span>)}
      </div>
      <div style={{ color: T.sub, fontSize: 12.5, marginBottom: 10 }}>
        one catalog, one pipeline — systems, sources &amp; versions,
        environments, collections, flow bindings</div>
      <div style={{ display: 'flex', gap: 4, borderBottom:
        `1px solid ${T.border}`, marginBottom: 12 }}>
        {ADMIN_TABS.map(([k, label]) => (
          <div key={k} onClick={() => setTab(k)}
            style={{ padding: '7px 15px', fontSize: 12.5,
              cursor: 'pointer',
              borderBottom: tab === k ? `2px solid ${T.pop || '#31bced'}`
                : '2px solid transparent',
              fontWeight: tab === k ? 700 : 400,
              color: tab === k ? T.navy : T.sub }}>{label}</div>))}
      </div>
      {tab === 'overview' && <AdminTab goIngest={(c) => {
        setIngestSys(c); setTab('contracts'); }} />}
      {tab === 'contracts' && <CatalogTab sys="ALL"
        preSystem={ingestSys} />}
      {tab === 'env' && <EnvTab envs={envs} refresh={refreshEnvs} />}
      {tab === 'builder' && <BuilderTab sys="ALL" />}
      {tab === 'flows' && <FlowBuilderTab envId={envId} />}
    </div>);
}
