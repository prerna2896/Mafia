// HTML reporter — turns evals/runs/*.jsonl into a self-contained HTML page.
//
// Usage:
//   tsx evals/report.ts                    # all jsonl in evals/runs/ → report.html
//   tsx evals/report.ts my-run.jsonl       # one specific file
//   tsx evals/report.ts --out custom.html  # custom output path
//
// Designed to be opened in a browser. No external CSS/JS — single file.

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

interface LogEvent {
  ts: string;
  scenario?: string;
  step?: number;
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
  duration_ms: number;
  ok: boolean;
  note?: string;
}

interface ScenarioBundle {
  name: string;
  description?: string;
  use_mock?: boolean;
  num_steps?: number;
  startedAt: string;
  endedAt?: string;
  totalDurationMs?: number;
  stepsOk: number;
  stepsFailed: number;
  events: LogEvent[];
  sourceFile: string;
}

const RUNS_DIR = 'evals/runs';

function loadJsonl(path: string): LogEvent[] {
  const text = readFileSync(path, 'utf-8');
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as LogEvent);
}

function bundleEvents(path: string, events: LogEvent[]): ScenarioBundle {
  const start = events.find(e => e.tool === '__scenario_start__');
  const end = events.find(e => e.tool === '__scenario_end__');
  const stepEvents = events.filter(e => e.tool !== '__scenario_start__' && e.tool !== '__scenario_end__');

  const stepsOk = stepEvents.filter(e => e.ok).length;
  const stepsFailed = stepEvents.filter(e => !e.ok).length;
  const startInput = (start?.input ?? {}) as Record<string, unknown>;
  const endOutput = (end?.output ?? {}) as Record<string, unknown>;

  return {
    name: start?.scenario ?? basename(path).replace(/\.jsonl$/, ''),
    description: typeof startInput.description === 'string' ? startInput.description : undefined,
    use_mock: typeof startInput.use_mock === 'boolean' ? startInput.use_mock : undefined,
    num_steps: typeof startInput.num_steps === 'number' ? startInput.num_steps : stepEvents.length,
    startedAt: start?.ts ?? events[0]?.ts ?? '',
    endedAt: end?.ts,
    totalDurationMs: typeof endOutput.duration_ms === 'number' ? endOutput.duration_ms : undefined,
    stepsOk,
    stepsFailed,
    events: stepEvents,
    sourceFile: path,
  };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fmtJson(v: unknown): string {
  return escapeHtml(JSON.stringify(v ?? null, null, 2));
}

function fmtMs(ms: number | undefined): string {
  if (ms == null) return '—';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function renderStep(e: LogEvent): string {
  const badge = e.ok
    ? '<span class="badge ok">ok</span>'
    : '<span class="badge fail">fail</span>';
  const note = e.note ? `<div class="note">${escapeHtml(e.note)}</div>` : '';
  const errorBlock = e.error
    ? `<div class="error"><strong>error:</strong> ${escapeHtml(e.error)}</div>`
    : '';
  const outputBlock = e.output !== undefined
    ? `<details><summary>output</summary><pre>${fmtJson(e.output)}</pre></details>`
    : '';

  return `
    <div class="step ${e.ok ? '' : 'is-fail'}">
      <div class="step-head">
        <span class="step-num">#${e.step ?? '?'}</span>
        <span class="tool-name">${escapeHtml(e.tool)}</span>
        ${badge}
        <span class="duration">${fmtMs(e.duration_ms)}</span>
      </div>
      ${note}
      <details><summary>input</summary><pre>${fmtJson(e.input)}</pre></details>
      ${outputBlock}
      ${errorBlock}
    </div>
  `;
}

function renderScenario(b: ScenarioBundle): string {
  const status =
    b.stepsFailed === 0
      ? '<span class="badge ok">all ok</span>'
      : `<span class="badge fail">${b.stepsFailed} failed</span>`;
  const mode = b.use_mock === true
    ? '<span class="mode-pill mode-mock">mock</span>'
    : b.use_mock === false
      ? '<span class="mode-pill mode-live">live</span>'
      : '';
  const desc = b.description ? `<p class="desc">${escapeHtml(b.description)}</p>` : '';

  return `
    <section class="scenario">
      <div class="scn-head">
        <h2>${escapeHtml(b.name)} ${mode}</h2>
        <div class="scn-meta">
          ${status}
          <span>${b.stepsOk}/${b.num_steps ?? b.events.length} steps</span>
          <span>${fmtMs(b.totalDurationMs)}</span>
          <span class="ts" title="started ${escapeHtml(b.startedAt)}">${escapeHtml(b.startedAt.slice(11, 19))}</span>
        </div>
      </div>
      ${desc}
      <div class="steps">
        ${b.events.map(renderStep).join('')}
      </div>
      <div class="src">source: <code>${escapeHtml(b.sourceFile)}</code></div>
    </section>
  `;
}

function renderHtml(bundles: ScenarioBundle[]): string {
  const totalOk = bundles.reduce((n, b) => n + b.stepsOk, 0);
  const totalFail = bundles.reduce((n, b) => n + b.stepsFailed, 0);
  const totalSteps = totalOk + totalFail;
  const totalMs = bundles.reduce((n, b) => n + (b.totalDurationMs ?? 0), 0);
  const generatedAt = new Date().toISOString();

  const summaryRows = bundles.map(b => `
    <tr class="${b.stepsFailed === 0 ? 'row-ok' : 'row-fail'}">
      <td><a href="#${escapeHtml(b.name)}">${escapeHtml(b.name)}</a></td>
      <td>${b.use_mock === true ? 'mock' : b.use_mock === false ? 'live' : '—'}</td>
      <td>${b.stepsOk}/${b.num_steps ?? b.events.length}</td>
      <td>${b.stepsFailed}</td>
      <td>${fmtMs(b.totalDurationMs)}</td>
      <td class="ts">${escapeHtml(b.startedAt.slice(0, 19).replace('T', ' '))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mafia eval report — ${generatedAt}</title>
<style>
  :root {
    --bg: #fafaf9;
    --fg: #1a1a1a;
    --muted: #555;
    --line: #e5e4e0;
    --ok: #1f7a2e;
    --ok-bg: #e8f5ec;
    --fail: #b03020;
    --fail-bg: #fdecea;
    --code: #f4f3ef;
    --accent: #2a4d8f;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; line-height: 1.5; margin: 0; padding: 0; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; }
  header.page { padding-bottom: 16px; border-bottom: 1px solid var(--line); margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h1 small { font-weight: normal; color: var(--muted); font-size: 13px; }
  h2 { font-size: 17px; margin: 0; }
  .topstats { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 8px; color: var(--muted); font-size: 14px; }
  .topstats strong { color: var(--fg); }
  .topstats .stat-fail strong { color: var(--fail); }
  table.summary { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 14px; }
  table.summary th, table.summary td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); }
  table.summary th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  table.summary tr.row-fail td { background: rgba(176, 48, 32, 0.04); }
  table.summary a { color: var(--accent); text-decoration: none; }
  table.summary a:hover { text-decoration: underline; }
  .ts { font-variant-numeric: tabular-nums; color: var(--muted); }
  section.scenario { margin-bottom: 32px; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: white; }
  .scn-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  .scn-meta { color: var(--muted); font-size: 13px; display: flex; gap: 12px; align-items: center; }
  .desc { color: var(--muted); margin: 4px 0 12px; font-size: 14px; }
  .steps { display: flex; flex-direction: column; gap: 10px; }
  .step { padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); font-size: 13px; }
  .step.is-fail { border-color: var(--fail); background: var(--fail-bg); }
  .step-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .step-num { color: var(--muted); font-weight: 600; min-width: 28px; }
  .tool-name { font-family: ui-monospace, SF Mono, Menlo, monospace; font-weight: 600; }
  .duration { color: var(--muted); margin-left: auto; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge.ok { background: var(--ok-bg); color: var(--ok); }
  .badge.fail { background: var(--fail-bg); color: var(--fail); }
  .mode-pill { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; vertical-align: middle; margin-left: 8px; }
  .mode-mock { background: #e0eaf6; color: var(--accent); }
  .mode-live { background: #fff4d6; color: #8a5a00; }
  .note { color: var(--muted); font-style: italic; margin: 4px 0 6px; font-size: 12px; }
  details { margin-top: 6px; }
  details summary { cursor: pointer; color: var(--muted); font-size: 12px; user-select: none; padding: 2px 0; }
  details summary:hover { color: var(--fg); }
  details[open] summary { color: var(--fg); margin-bottom: 4px; }
  pre { background: var(--code); padding: 8px 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; line-height: 1.45; margin: 0; max-height: 400px; }
  code { font-family: ui-monospace, SF Mono, Menlo, monospace; }
  .error { background: var(--fail-bg); color: var(--fail); padding: 8px 10px; border-radius: 4px; margin-top: 6px; font-size: 13px; }
  .src { margin-top: 12px; color: var(--muted); font-size: 11px; }
  .src code { background: var(--code); padding: 1px 4px; border-radius: 3px; }
  .controls { margin-bottom: 16px; }
  .controls label { font-size: 13px; color: var(--muted); cursor: pointer; user-select: none; }
  .controls input { margin-right: 4px; }
  body.hide-passing section.scenario:has(.scn-head .badge.ok) { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <h1>Mafia eval report <small>generated ${generatedAt}</small></h1>
    <div class="topstats">
      <span><strong>${bundles.length}</strong> scenario${bundles.length === 1 ? '' : 's'}</span>
      <span><strong>${totalOk}</strong> / <strong>${totalSteps}</strong> steps ok</span>
      <span class="${totalFail > 0 ? 'stat-fail' : ''}"><strong>${totalFail}</strong> failed</span>
      <span><strong>${fmtMs(totalMs)}</strong> total</span>
    </div>
  </header>

  <div class="controls">
    <label><input type="checkbox" id="toggle-passing"> hide all-passing scenarios</label>
  </div>

  <table class="summary">
    <thead>
      <tr>
        <th>scenario</th>
        <th>mode</th>
        <th>steps</th>
        <th>failed</th>
        <th>duration</th>
        <th>started</th>
      </tr>
    </thead>
    <tbody>${summaryRows}</tbody>
  </table>

  ${bundles.map(b => `<a id="${escapeHtml(b.name)}"></a>${renderScenario(b)}`).join('')}
</div>

<script>
  document.getElementById('toggle-passing').addEventListener('change', e => {
    document.body.classList.toggle('hide-passing', e.target.checked);
  });
</script>
</body>
</html>
`;
}

function main() {
  const args = process.argv.slice(2);
  let outPath = join(RUNS_DIR, 'report.html');
  const inputs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' || args[i] === '-o') {
      outPath = args[++i];
    } else {
      inputs.push(args[i]);
    }
  }

  let paths: string[];
  if (inputs.length === 0) {
    try {
      paths = readdirSync(RUNS_DIR)
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .map(f => join(RUNS_DIR, f));
    } catch {
      console.error(`No ${RUNS_DIR} directory or no .jsonl files. Run an eval first.`);
      process.exit(1);
    }
  } else {
    paths = inputs;
  }

  if (paths.length === 0) {
    console.error('No JSONL files to report on. Run npm run eval:mock first.');
    process.exit(1);
  }

  const bundles = paths.map(p => bundleEvents(p, loadJsonl(p)));
  // Most recent first
  bundles.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  const html = renderHtml(bundles);
  writeFileSync(outPath, html, 'utf-8');
  console.log(`Wrote ${outPath} (${bundles.length} scenario${bundles.length === 1 ? '' : 's'})`);
}

main();
