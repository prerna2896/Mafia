import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
// Load .env relative to this file so the server works regardless of CWD
// (matters when launched by Claude Desktop, Claude Code, or other MCP hosts).
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { fetchEmailsSchema, fetchEmailsTool } from './tools/fetch-emails.js';
import { summarizeEmailSchema, summarizeEmailTool } from './tools/summarize-email.js';
import { actOnEmailSchema, actOnEmailTool } from './tools/act-on-email.js';
import { commitSessionSchema, commitSessionTool } from './tools/commit-session.js';
import { getSessionStatsSchema, getSessionStatsTool } from './tools/get-stats.js';
import { restoreSchema, restoreTool } from './tools/restore.js';
import { listVaultSchema, listVaultTool } from './tools/list-vault.js';
import { clearVaultSchema, clearVaultTool } from './tools/clear-vault.js';
import { getDb, getFirstUser } from './db/index.js';
import { makeGmailAdapter } from './gmail/adapter.js';
import { reconcileInFlight } from './quarantine/outbox.js';
import { runPurger } from './quarantine/purger.js';

const server = new McpServer({ name: 'mafia', version: '0.2.0' });

// ── Tools ─────────────────────────────────────────────────────────────────────

server.tool(
  'fetch_emails',
  'Pull recent low-priority emails from Gmail for review. Returns metadata only — no body, no Gmail mutation. Use first to see what could be cleaned up.',
  fetchEmailsSchema.shape,
  async (input) => {
    const result = await fetchEmailsTool(input as never);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'summarize_email',
  'AI summary + recommended action (keep/archive/delete) for one email. Sends headers + snippet to Claude Haiku. Body inclusion is opt-in via include_body.',
  summarizeEmailSchema.shape,
  async (input) => {
    const result = await summarizeEmailTool(input as never);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'act_on_email',
  'Flag one email for keep / archive (move from inbox) / delete (move to Vault). Nothing happens in Gmail until commit_session is called. All non-keep actions are recoverable for 30 days.',
  actOnEmailSchema.shape,
  async (input) => {
    const result = await actOnEmailTool(input as never);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'commit_session',
  'Apply all flagged actions from the active session. Archive and delete intents move emails to the Vault (recoverable for 30 days). dry_run=true previews without calling Gmail.',
  commitSessionSchema.shape,
  async (input) => {
    const result = await commitSessionTool(input as never);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'list_vault',
  "Browse the Vault — items moved out of inbox that are still recoverable. Returns sender, subject, days-until-purge, and the action_id you can pass to restore. Use this to surface the vault as a place, not a buried recovery flow.",
  listVaultSchema.shape,
  async (input) => {
    const result = await listVaultTool(input as never);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'restore',
  "Pull one or more emails out of the Vault back into the inbox. Provide action_id (preferred) or email_id. Works on archive (re-add INBOX label) and delete (untrash). Logs the restore in the reflog.",
  restoreSchema.shape,
  async (input) => {
    const result = await restoreTool(input as never);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'clear_vault',
  "Force-purge items from Mafia's local Vault before their natural 30-day expiry. Drops the local snapshot/body and marks the item 'purged' — after this it cannot be restored from Mafia. Defaults to a preview (confirm=false) and only items older than 7 days. Does NOT hard-delete from Gmail; the email itself remains in trash/All Mail until Gmail's own retention expires.",
  clearVaultSchema.shape,
  async (input) => {
    const result = await clearVaultTool(input as never);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'get_session_stats',
  "Investment metrics: total vaulted, restored, purged; restore rate (calibration signal); reflog entries (your audit history). Plus current session preview.",
  getSessionStatsSchema.shape,
  async () => {
    const result = await getSessionStatsTool();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Startup tasks ─────────────────────────────────────────────────────────────

// Reconcile any in-flight rows from a prior crashed session, then run the
// purge sweep. Both are best-effort — failures here log but don't block start.
async function startupReconcile() {
  try {
    const user = getFirstUser();
    if (!user) return; // user hasn't auth'd yet
    const db = getDb();
    const gmail = makeGmailAdapter(user.id);
    const reconciled = await reconcileInFlight(db, gmail);
    const purged = runPurger(db);
    // Truncate the WAL on startup so a long-idle server doesn't ship with
    // a stale, oversized journal. autocheckpoint handles the steady state;
    // this just bounds the cold-start floor.
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
      console.error('Mafia startup: wal_checkpoint failed:', err);
    }
    if (reconciled.reconciled.length || reconciled.failed.length || purged.purged.length) {
      console.error(
        `Mafia startup: reconciled ${reconciled.reconciled.length}, ` +
        `failed ${reconciled.failed.length}, purged ${purged.purged.length}.`,
      );
    }
  } catch (err) {
    console.error('Mafia startup reconcile failed:', err);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Fire and forget — don't block MCP handshake on it.
void startupReconcile();

console.error('Mafia MCP server running (v0.2.0 — quarantine + reflog)');

// ── Shutdown ──────────────────────────────────────────────────────────────────
// MCP SDK's StdioServerTransport doesn't exit on its own when the host closes
// the stdio pipe; without these hooks the process becomes an orphan zombie
// (idle, holding an open SQLite fd) and accumulates one per dirty host exit.
let shuttingDown = false;
const shutdown = (sig: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`Mafia exiting (${sig})`);
  try { getDb().close(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.stdin.on('end', () => shutdown('stdin-EOF'));
