import { z } from 'zod';
import { createSession, getSession, getFirstUser, getDb } from '../db/index.js';
import { flagAction } from '../quarantine/outbox.js';

// In-memory active session per user. Survives only within one process; that's
// the same behavior as before — a fresh process starts a fresh session.
const activeSessions = new Map<string, string>();

export const actOnEmailSchema = z.object({
  email_id: z.string().describe('Gmail message ID to act on'),
  action: z.enum(['keep', 'delete', 'archive']).describe(
    "keep = do nothing; delete = move to Vault (Gmail trash, recoverable for 30 days); archive = move to Vault (remove INBOX, recoverable from All Mail)",
  ),
  thread_id: z.string().optional().describe('Optional Gmail thread ID for context'),
  rule_provenance: z.string().optional().describe(
    'Why this action is being taken — rule name, AI suggestion, or "user". Recorded in the reflog and helps power future allowlist UX.',
  ),
  session_id: z.string().optional().describe(
    'Session ID. If omitted, uses the active session or creates a new one.',
  ),
});

export type ActOnEmailInput = z.infer<typeof actOnEmailSchema>;

export async function actOnEmailTool(input: ActOnEmailInput) {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  let sessionId = input.session_id ?? activeSessions.get(user.id);
  if (!sessionId || !getSession(sessionId)) {
    sessionId = createSession(user.id);
    activeSessions.set(user.id, sessionId);
  }

  const action = flagAction(getDb(), {
    user_id: user.id,
    session_id: sessionId,
    email_id: input.email_id,
    thread_id: input.thread_id ?? null,
    intent: input.action,
    rule_provenance: input.rule_provenance ?? 'user',
  });

  const messages: Record<typeof input.action, string> = {
    keep: 'Kept — email will stay in inbox',
    delete: 'Flagged — will move to Vault on commit (recoverable for 30 days)',
    archive: 'Flagged — will archive on commit (recoverable from All Mail)',
  };

  return {
    success: true,
    action_id: action.id,
    email_id: input.email_id,
    intent: input.action,
    state: action.state,
    session_id: sessionId,
    message: messages[input.action],
    hint: 'Nothing has happened in Gmail yet. Call commit_session to apply, or call act_on_email again with action="keep" to undo.',
  };
}

export function getActiveSession(userId: string): string | undefined {
  return activeSessions.get(userId);
}

export function setActiveSession(userId: string, sessionId: string) {
  activeSessions.set(userId, sessionId);
}

export function clearActiveSession(userId: string) {
  activeSessions.delete(userId);
}
