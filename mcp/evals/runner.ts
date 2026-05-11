// Eval scenario runner.
//
// Usage:
//   tsx evals/runner.ts                        # runs all scenarios in evals/scenarios/
//   tsx evals/runner.ts mock                   # runs only mock-mode scenarios (safe; no Gmail calls)
//   tsx evals/runner.ts live                   # runs only live-mode scenarios (real Gmail!)
//   tsx evals/runner.ts evals/scenarios/X.json # run one scenario by path
//
// Outputs JSONL logs to evals/runs/<scenario>-<timestamp>.jsonl plus a summary
// to stdout. Each line is a structured event suitable for jq inspection later.

import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';

import type { Scenario, ScenarioStep } from './types.js';
import { JsonlLogger, type LogEvent } from '../src/lib/eval-logger.js';
import {
  setGmailAdapterFactory,
  resetGmailAdapterFactory,
  type GmailAdapter,
} from '../src/gmail/adapter.js';
import { MockGmailAdapter } from '../src/testing/mock-gmail.js';
import { closeDb, setDbPath, getDb } from '../src/db/index.js';
import { clearActiveSession } from '../src/tools/act-on-email.js';

import { fetchEmailsTool } from '../src/tools/fetch-emails.js';
import { summarizeEmailTool } from '../src/tools/summarize-email.js';
import { actOnEmailTool } from '../src/tools/act-on-email.js';
import { commitSessionTool } from '../src/tools/commit-session.js';
import { listVaultTool } from '../src/tools/list-vault.js';
import { restoreTool } from '../src/tools/restore.js';
import { getSessionStatsTool } from '../src/tools/get-stats.js';

type ToolFn = (input: Record<string, unknown>) => Promise<unknown>;

const TOOLS: Record<ScenarioStep['tool'], ToolFn> = {
  fetch_emails: fetchEmailsTool as ToolFn,
  summarize_email: summarizeEmailTool as ToolFn,
  act_on_email: actOnEmailTool as ToolFn,
  commit_session: commitSessionTool as ToolFn,
  list_vault: listVaultTool as ToolFn,
  restore: restoreTool as ToolFn,
  get_session_stats: getSessionStatsTool as ToolFn,
};

interface RunSummary {
  scenario: string;
  steps_total: number;
  steps_ok: number;
  steps_failed: number;
  log_path: string;
  duration_ms: number;
}

async function runScenario(path: string): Promise<RunSummary> {
  const scenario = JSON.parse(readFileSync(path, 'utf-8')) as Scenario;
  const startedAt = Date.now();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = join('evals/runs', `${scenario.name}-${ts}.jsonl`);
  const logger = new JsonlLogger(logPath);

  let tempDir: string | null = null;
  if (scenario.use_mock) {
    tempDir = mkdtempSync(join(tmpdir(), 'mafia-eval-'));
    setDbPath(join(tempDir, 'mafia-eval.db'));

    const mockAdapter = new MockGmailAdapter({ labels: scenario.mock?.labels });
    for (const m of scenario.mock?.fail_once ?? []) mockAdapter.failOnce.add(m);
    for (const m of scenario.mock?.fail_always ?? []) mockAdapter.failAlways.add(m);
    setGmailAdapterFactory((): GmailAdapter => mockAdapter);

    seedUser(scenario.seed?.user_id ?? 'eval-user', scenario.seed?.user_email ?? 'eval@example.com');
    clearActiveSession(scenario.seed?.user_id ?? 'eval-user');
  } else {
    resetGmailAdapterFactory();
  }

  logger.log({
    ts: new Date().toISOString(),
    scenario: scenario.name,
    tool: '__scenario_start__',
    input: { description: scenario.description, use_mock: scenario.use_mock, num_steps: scenario.steps.length },
    duration_ms: 0,
    ok: true,
  });

  const stepOutputs: unknown[] = [];
  let stepsOk = 0;
  let stepsFailed = 0;

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const fn = TOOLS[step.tool];
    if (!fn) {
      stepsFailed++;
      logger.log(stepEvent(scenario.name, i, step.tool, step.input, undefined, `unknown tool: ${step.tool}`, 0));
      continue;
    }
    const resolvedInput = resolveTemplates(step.input, stepOutputs);
    const startStep = Date.now();
    try {
      const out = await fn(resolvedInput);
      stepOutputs.push(out);
      stepsOk++;
      logger.log({
        ...stepEvent(scenario.name, i, step.tool, resolvedInput, out, undefined, Date.now() - startStep),
        ...(step.note ? { note: step.note } : {}),
      } as LogEvent);
    } catch (err) {
      stepOutputs.push(undefined);
      const errMsg = err instanceof Error ? err.message : String(err);
      const isExpected = step.expect_error === true;
      if (isExpected) stepsOk++;
      else stepsFailed++;
      logger.log({
        ...stepEvent(scenario.name, i, step.tool, resolvedInput, undefined, errMsg, Date.now() - startStep),
        ok: isExpected,
      });
    }
  }

  const duration = Date.now() - startedAt;
  logger.log({
    ts: new Date().toISOString(),
    scenario: scenario.name,
    tool: '__scenario_end__',
    input: null,
    output: { steps_total: scenario.steps.length, steps_ok: stepsOk, steps_failed: stepsFailed, duration_ms: duration },
    duration_ms: duration,
    ok: stepsFailed === 0,
  });

  // Tear down mock state
  if (tempDir) {
    closeDb();
    resetGmailAdapterFactory();
    rmSync(tempDir, { recursive: true, force: true });
  }

  return {
    scenario: scenario.name,
    steps_total: scenario.steps.length,
    steps_ok: stepsOk,
    steps_failed: stepsFailed,
    log_path: logPath,
    duration_ms: duration,
  };
}

function stepEvent(
  scenario: string,
  step: number,
  tool: string,
  input: unknown,
  output: unknown,
  error: string | undefined,
  duration_ms: number,
): LogEvent {
  return {
    ts: new Date().toISOString(),
    scenario,
    step,
    tool,
    input,
    output: error ? undefined : output,
    ...(error ? { error } : {}),
    duration_ms,
    ok: !error,
  };
}

function seedUser(user_id: string, email: string) {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, access_token, refresh_token, token_expiry)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user_id, email, 'Eval User', 'mock-token', 'mock-refresh', Date.now() + 3600_000);
  db.prepare(`INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)`).run(user_id);
  db.prepare(`INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)`).run(user_id);
}

/**
 * Replace `<step:N.path.to.field>` placeholders in input with values from
 * earlier step outputs. Lets scenarios chain: e.g. take action_id from step 0,
 * pass to restore in step 3.
 */
function resolveTemplates(input: unknown, outputs: unknown[]): unknown {
  if (typeof input === 'string') {
    return input.replace(/<step:(\d+)\.([^>]+)>/g, (_, idxStr, path) => {
      const idx = Number(idxStr);
      const out = outputs[idx];
      const value = path.split('.').reduce((acc: unknown, k: string) => {
        if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
          return (acc as Record<string, unknown>)[k];
        }
        return undefined;
      }, out);
      return value === undefined ? '' : String(value);
    });
  }
  if (Array.isArray(input)) return input.map(v => resolveTemplates(v, outputs));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = resolveTemplates(v, outputs);
    return out;
  }
  return input;
}

async function main() {
  const arg = process.argv[2];
  let paths: string[];

  if (!arg || arg === 'all') {
    paths = readdirSync('evals/scenarios')
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => join('evals/scenarios', f));
  } else if (arg === 'mock' || arg === 'live') {
    const all = readdirSync('evals/scenarios')
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => join('evals/scenarios', f));
    paths = all.filter(p => {
      const s = JSON.parse(readFileSync(p, 'utf-8')) as Scenario;
      return arg === 'mock' ? s.use_mock : !s.use_mock;
    });
  } else {
    paths = [arg];
  }

  if (paths.length === 0) {
    console.log('No scenarios to run.');
    return;
  }

  console.log(`Running ${paths.length} scenario(s)...\n`);
  const summaries: RunSummary[] = [];
  for (const p of paths) {
    process.stdout.write(`  ${basename(p)} ... `);
    const s = await runScenario(p);
    process.stdout.write(`${s.steps_ok}/${s.steps_total} ok in ${s.duration_ms}ms → ${s.log_path}\n`);
    summaries.push(s);
  }

  const totalSteps = summaries.reduce((n, s) => n + s.steps_total, 0);
  const totalOk = summaries.reduce((n, s) => n + s.steps_ok, 0);
  const totalFail = summaries.reduce((n, s) => n + s.steps_failed, 0);
  console.log(`\nDone. ${summaries.length} scenarios, ${totalOk}/${totalSteps} steps ok, ${totalFail} failed.`);
  console.log(`Logs: evals/runs/`);

  if (totalFail > 0) process.exit(1);
}

main().catch(err => {
  console.error('Eval runner crashed:', err);
  process.exit(2);
});
