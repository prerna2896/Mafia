// Eval scenario schema. Declarative description of a tool-call sequence.
//
// Fields support light templating: any string value of the form
// `<step:N.path.to.field>` is replaced at run time with the value at that
// path in step N's output. Example: `<step:0.action_id>` pulls action_id from
// the first step's output.

export interface ScenarioStep {
  /** MCP tool name to invoke (e.g. "act_on_email"). */
  tool:
    | 'fetch_emails'
    | 'summarize_email'
    | 'act_on_email'
    | 'commit_session'
    | 'list_vault'
    | 'restore'
    | 'get_session_stats';
  /** Inputs to pass to the tool. May contain template strings. */
  input: Record<string, unknown>;
  /** Optional human description shown in the log. */
  note?: string;
  /** If true, runner tolerates an error from this step and continues. */
  expect_error?: boolean;
}

export interface MockGmailSetup {
  /** Initial label state per email id, e.g. { "msg1": ["INBOX"] }. */
  labels?: Record<string, string[]>;
  /** Force a method to fail once (e.g. ["trash", "untrash"]). */
  fail_once?: string[];
  /** Force a method to fail every time. */
  fail_always?: string[];
}

export interface Scenario {
  name: string;
  description?: string;
  /** If true, use MockGmailAdapter + an isolated DB; otherwise hit real Gmail. */
  use_mock: boolean;
  /** Mock setup (only used when use_mock=true). */
  mock?: MockGmailSetup;
  /** Optional user_id and session_id seeds for the scenario. Auto-generated if omitted. */
  seed?: { user_id?: string; user_email?: string };
  steps: ScenarioStep[];
}
