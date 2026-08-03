# Patch notes for YOUR files (apply by hand — I don't edit these blind)

These three changes fix the confirmed bug where the Non-SEI toggle in your
API 360 still listed all 57 SEI business functions, and give the API 360
screen the runnable/docs-only badge.

## 1. main.py — /bf/api-flows must honor the project toggle
Your `/bf/api-flows` endpoint selects from `api_business_flows` with no
project filter. Add the same clause pattern your `routers_api360.py`
`_project_clause` uses:

```python
@app.get("/bf/api-flows")
def bf_api_flows(project: str | None = None):
    ...
    clause = "1=1"
    binds = {}
    if project == "sei":
        clause = "project_id = 'sei'"
    elif project == "non-sei":
        clause = "project_id <> 'sei'"
    elif project and project != "all":
        clause = "project_id = :p"; binds["p"] = project
    cur.execute(f"""SELECT ... FROM api_business_flows
                    WHERE is_published = 'Y' AND {clause}
                    ORDER BY domain, business_name""", binds)
```

Optional, one extra column for the badge:
```sql
  , (SELECT CASE WHEN COUNT(*) > 0 THEN 'Y' ELSE 'N' END
     FROM api_flow_bindings b WHERE b.flow_id = f.flow_id) AS runnable
```

## 2. ui/src/api.js — forward the project param
```js
bfApiFlows: (project) => get('/bf/api-flows'
  + (project && project !== 'all' ? `?project=${project}` : ''),
  () => MOCK.bfApiFlows ? MOCK.bfApiFlows() : { flows: [] }),
```

## 3. ui/src/Api360.jsx (~line 33) — pass the toggle + empty state
Currently: `api.bfApiFlows()` — unfiltered, hence the leak.

```js
useEffect(() => {
  api.bfApiFlows(project).then((d) => setFlows(d.flows || []));
}, [project]);
```

And under the flows list, an honest empty state (mirrors the mockup):
```jsx
{!flows.length && (
  <div style={{ padding: '18px 14px', fontSize: 12, color: T.sub }}>
    No business functions for this system yet — non-SEI specs land in
    NON-SEI/&lt;system&gt;/ in the artifacts tree; the connector picks
    them up on the next scan.
  </div>)}
```

Optional badge on each row, if you added the `runnable` column:
```jsx
{f.runnable === 'Y'
  ? <Chip tone="green">runnable</Chip>
  : <Chip tone="grey">docs-only</Chip>}
```

## 4. main.py mount tuple (if not already done)
Add to the guarded loop: `routers_api360_console`, `routers_recon360`,
`routers_admin_datasources`. The auto-discovering main.py from the
previous drop makes this permanent (globs `routers_*.py`, shouts
ROUTER MOUNT FAILED on breakage).

## What is guaranteed untouched
`api_business_flows` reads, `api_business_flow_steps`, `api_endpoints`,
`bf_pipelines.linked_api_flow_id`, datapoint links — your business-function
detail screen renders identically; bindings are a sidecar keyed by flow_id.
