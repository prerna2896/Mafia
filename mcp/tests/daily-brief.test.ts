// Tests for the daily_brief MCP resource.
//
// Strategy: build a real in-memory DB and exercise `runDailyBrief` directly.
// Gmail is injected as `topSendersFn` — no googleapis mock needed. This keeps
// the test focused on what the resource composes (DB state + Gmail summary),
// not on the topSenders aggregation logic (covered in top-senders.test.ts).

import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, MockGmailAdapter } from './helpers.js';
import { runDailyBrief } from '../src/resources/daily-brief.js';
import { flagAction, commitAction } from '../src/quarantine/outbox.js';
import { setActiveSession, clearActiveSession } from '../src/tools/act-on-email.js';
import type { TopSendersResult } from '../src/gmail/client.js';

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  clearActiveSession('user_db');
});

const USER = 'user_db';
const FIXED_NOW = new Date('2026-05-11T12:00:00Z');

function setup() {
  const { db, close } = makeTestDb();
  cleanup = close;
  return { db };
}

function stubTopSenders(result: TopSendersResult) {
  return async (_uid: string, _opts: unknown): Promise<TopSendersResult> => result;
}

function failingTopSenders(): typeof stubTopSenders extends never ? never : Parameters<typeof runDailyBrief>[2]['topSendersFn'] {
  return async () => {
    throw new Error('gmail unauth');
  };
}

describe('daily_brief', () => {
  it('empty DB: returns "Nothing flagged" + "Vault is empty" + zero-investment hint', async () => {
    const { db } = setup();
    const md = await runDailyBrief(db, USER, {
      now: FIXED_NOW,
      topSendersFn: failingTopSenders(),
    });

    expect(md).toContain('# Mafia daily brief — 2026-05-11');
    expect(md).toContain('## Pending in this session');
    expect(md).toContain('Nothing flagged.');
    expect(md).toContain('## Vault expirations');
    expect(md).toContain('Vault is empty.');
    expect(md).toContain('## Investment');
    expect(md).toContain('No actions yet');
    // top-sender section was skipped (topSendersFn threw)
    expect(md).not.toContain('## Top sender');
  });

  it('shows pending counts grouped by intent from the active session', async () => {
    const { db } = setup();
    const sessId = 'sess_pending';
    setActiveSession(USER, sessId);

    flagAction(db, { user_id: USER, session_id: sessId, email_id: 'm1', intent: 'delete' });
    flagAction(db, { user_id: USER, session_id: sessId, email_id: 'm2', intent: 'delete' });
    flagAction(db, { user_id: USER, session_id: sessId, email_id: 'm3', intent: 'archive' });
    flagAction(db, { user_id: USER, session_id: sessId, email_id: 'm4', intent: 'keep' });

    const md = await runDailyBrief(db, USER, {
      now: FIXED_NOW,
      topSendersFn: failingTopSenders(),
    });

    expect(md).toContain('4 flagged but uncommitted');
    expect(md).toContain('2 delete');
    expect(md).toContain('1 archive');
    expect(md).toContain('1 keep');
  });

  it('reports vault expirations within 3 days', async () => {
    const { db } = setup();
    const gmail = new MockGmailAdapter({ m1: ['INBOX'], m2: ['INBOX'] });
    const sessId = 'sess_v';

    // Commit two items into the vault.
    const a1 = flagAction(db, { user_id: USER, session_id: sessId, email_id: 'm1', intent: 'delete' });
    await commitAction(db, gmail, a1.id);
    const a2 = flagAction(db, { user_id: USER, session_id: sessId, email_id: 'm2', intent: 'archive' });
    await commitAction(db, gmail, a2.id);

    // Pull one into the next-3-days window. fixed now = May 11 12:00Z.
    const nowSec = Math.floor(FIXED_NOW.getTime() / 1000);
    db.prepare(`UPDATE email_actions SET purge_after = ? WHERE id = ?`).run(
      nowSec + 86400 * 2, // ~2 days from FIXED_NOW
      a1.id,
    );

    const md = await runDailyBrief(db, USER, {
      now: FIXED_NOW,
      topSendersFn: failingTopSenders(),
    });

    expect(md).toContain('## Vault expirations');
    expect(md).toMatch(/1 item\(s\) will purge in the next 3 days/);
    expect(md).toContain('earliest in 2 days');
  });

  it('vault non-empty but nothing imminent: shows count + "none expiring soon"', async () => {
    const { db } = setup();
    const gmail = new MockGmailAdapter({ m1: ['INBOX'] });
    const sessId = 'sess_v2';
    const a1 = flagAction(db, { user_id: USER, session_id: sessId, email_id: 'm1', intent: 'archive' });
    await commitAction(db, gmail, a1.id);
    // Default purge_after = +30d, well outside the 3d window.

    const md = await runDailyBrief(db, USER, {
      now: FIXED_NOW,
      topSendersFn: failingTopSenders(),
    });

    expect(md).toContain('1 item(s) in vault, none expiring in the next 3 days.');
  });

  it('investment metrics: vaulted/restored/restoreRate from email_actions states', async () => {
    const { db } = setup();
    const gmail = new MockGmailAdapter({ m1: ['INBOX'], m2: ['INBOX'], m3: ['INBOX'] });
    const sessId = 'sess_i';

    // Vault 3, restore 1 → restore rate 33.3%
    const ids: string[] = [];
    for (const eid of ['m1', 'm2', 'm3']) {
      const a = flagAction(db, { user_id: USER, session_id: sessId, email_id: eid, intent: 'delete' });
      const c = await commitAction(db, gmail, a.id);
      ids.push(c.id);
    }
    const { restoreAction } = await import('../src/quarantine/outbox.js');
    await restoreAction(db, gmail, ids[0]);

    const md = await runDailyBrief(db, USER, {
      now: FIXED_NOW,
      topSendersFn: failingTopSenders(),
    });

    expect(md).toContain('## Investment');
    expect(md).toMatch(/You've vaulted 3 · restored 1 · restore rate 33\.3%/);
  });

  it('top sender section appears when topSendersFn returns data', async () => {
    const { db } = setup();
    const stub = stubTopSenders({
      totalScanned: 87,
      totalSendersFound: 24,
      topSenders: [{
        from: 'Acme <promos@acme.com>',
        fromEmail: 'promos@acme.com',
        count: 19,
        percentOfScanned: 21.8,
        estimatedKB: 412,
        sampleSubjects: ['Sale!', 'New arrivals', 'Last chance'],
      }],
      coverage: { topN_count: 19, topN_percent: 21.8 },
    });

    const md = await runDailyBrief(db, USER, { now: FIXED_NOW, topSendersFn: stub });
    expect(md).toContain('## Top sender (last 7 days)');
    expect(md).toContain('19 from `promos@acme.com`');
    expect(md).toContain('21.8% of 87 scanned');
  });

  it('top sender section is skipped when topSendersFn throws', async () => {
    const { db } = setup();
    const md = await runDailyBrief(db, USER, {
      now: FIXED_NOW,
      topSendersFn: failingTopSenders(),
    });
    expect(md).not.toContain('## Top sender');
  });

  it('top sender section is skipped when topSendersFn returns nothing', async () => {
    const { db } = setup();
    const empty = stubTopSenders({
      totalScanned: 0,
      totalSendersFound: 0,
      topSenders: [],
      coverage: { topN_count: 0, topN_percent: 0 },
    });
    const md = await runDailyBrief(db, USER, { now: FIXED_NOW, topSendersFn: empty });
    expect(md).not.toContain('## Top sender');
  });

  it('output is valid markdown ending with the tip footer', async () => {
    const { db } = setup();
    const md = await runDailyBrief(db, USER, {
      now: FIXED_NOW,
      topSendersFn: failingTopSenders(),
    });
    expect(md.startsWith('# Mafia daily brief — ')).toBe(true);
    expect(md).toMatch(/\*Tip: ask me to "show top senders".*\*$/);
  });
});
