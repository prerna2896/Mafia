# Mafia evals — scenario-based input/output testing

A declarative way to exercise Mafia's tools and capture every input/output pair to JSONL for offline review. Built on top of the same tool functions that the MCP server exposes — what you test here is what production calls.

---

## Run

```bash
npm run eval         # run every scenario in evals/scenarios/
npm run eval:mock    # only mock-mode scenarios (safe; no Gmail traffic)
npm run eval:live    # only live-mode scenarios (real Gmail!)
npm run eval evals/scenarios/01-basic-triage.json   # one scenario by path
```

Each run writes a JSONL file under `evals/runs/` (gitignored). Filename is `<scenario-name>-<timestamp>.jsonl`. One line per event — scenario start, each step, scenario end.

## Inspect

```bash
# every step that errored, across all runs
cat evals/runs/*.jsonl | jq 'select(.ok == false)'

# average step latency per tool, across one run
cat evals/runs/01-basic-triage-*.jsonl \
  | jq -s 'group_by(.tool) | map({tool: .[0].tool, avg_ms: (map(.duration_ms) | add / length)})'

# list every action_id created in a run
cat evals/runs/02-restore-roundtrip-*.jsonl \
  | jq 'select(.tool == "act_on_email") | .output.action_id'
```

## Write a scenario

Drop a JSON file in `evals/scenarios/`:

```jsonc
{
  "name": "my-scenario",
  "description": "What this exercises",
  "use_mock": true,                      // false = hit real Gmail
  "mock": {                              // ignored when use_mock=false
    "labels": { "msg1": ["INBOX"] },     // initial Gmail state
    "fail_once": ["trash"],              // simulate one trash() failure
    "fail_always": []
  },
  "steps": [
    { "tool": "act_on_email", "input": { "email_id": "msg1", "action": "delete" } },
    { "tool": "commit_session", "input": {} },
    { "tool": "list_vault", "input": { "state": "quarantined" } },
    { "tool": "restore",
      "input": { "action_id": "<step:0.action_id>" },        // template: chain from earlier step
      "note": "restore by the action_id we just created" },
    { "tool": "restore",
      "input": { "action_id": "missing" },
      "expect_error": true }                                 // tolerate the error, count as ok
  ]
}
```

### Template substitution

Any string like `<step:N.path.to.field>` is replaced with the value at that path in step N's output.

`<step:0.action_id>` → `act_1778233048010_n513ruyk` (whatever the first step returned).

### Mock vs live

| | mock | live |
|---|---|---|
| Hits Gmail? | no — `MockGmailAdapter` substituted via factory | yes — real `GoogleApisGmailAdapter` |
| DB | isolated tmpdir (`/tmp/mafia-eval-XXX/mafia-eval.db`) | your `data/mafia.db` |
| User | seeded as `eval-user` / `eval@example.com` | first user in your real DB |
| Speed | sub-10ms per scenario | seconds — depends on Gmail latency |
| Side effects | none | will actually modify your inbox |

**Live mode caveats:** scenarios run against your real authenticated user. Anything that calls `commit_session` will move emails in your real Gmail. Use `dry_run: true` on `commit_session` if you want to log what *would* happen without the API call.

## How it works

1. Scenario JSON → parsed into `Scenario` struct.
2. Runner sets up DB + Gmail adapter:
   - mock: tmp DB + `setGmailAdapterFactory(MockGmailAdapter)` + seed user.
   - live: production DB + production adapter.
3. For each step: resolve templates, call the tool function, append a JSONL line.
4. On scenario end: write summary line, tear down isolation if mock.

The runner uses the **same tool functions** the MCP server registers — `actOnEmailTool`, `commitSessionTool`, etc. So any divergence between eval behavior and Claude-Desktop behavior is a real bug.

## Adding a new tool to the runner

Edit `evals/runner.ts`:

```typescript
import { newTool } from '../src/tools/new-tool.js';
const TOOLS = {
  // ...
  new_tool: newTool as ToolFn,
};
```

And add `'new_tool'` to the `tool` union in `evals/types.ts`.

## When to use this vs. unit tests

- **Unit tests (`npm test`)** — fast, fine-grained, test one module in isolation. 48 currently.
- **Evals (`npm run eval`)** — exercise the full tool surface as a user would, log structured outputs, useful for regression review and shape verification across changes.

Both should pass before declaring V0 done. Evals also serve as fixtures for "this is what a typical session looks like" when adapting Mafia for new MCP hosts.
