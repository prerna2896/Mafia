/**
 * One-shot: repair email_snapshots rows whose headers_json is empty.
 *
 * Background: pre-fix, GmailAdapter.fetchDetail used format:'raw' for delete
 * intent and read payload.headers (which Gmail does not populate for raw),
 * so every delete-intent snapshot was stored with `{}` as its headers.
 * After the fix, new snapshots capture headers correctly; this script back-
 * fills the existing rows by re-fetching metadata from Gmail.
 *
 * Run: npm run backfill-headers
 * Idempotent: only updates rows that are still empty.
 */

import 'dotenv/config';
import { getDb, getFirstUser } from '../db/index.js';
import { makeGmailAdapter } from '../gmail/adapter.js';

interface EmptyRow {
  id: string;
  email_id: string;
}

const db = getDb();
const user = getFirstUser();
if (!user) {
  console.error('Not authenticated. Run: npm run auth');
  process.exit(1);
}

const rows = db
  .prepare(`SELECT id, email_id FROM email_snapshots WHERE headers_json = '{}'`)
  .all() as EmptyRow[];

console.log(`Found ${rows.length} snapshot(s) with empty headers.`);
if (rows.length === 0) process.exit(0);

const adapter = makeGmailAdapter(user.id);
const update = db.prepare(
  `UPDATE email_snapshots SET headers_json = ?, label_ids_json = ? WHERE id = ?`,
);

let ok = 0;
let missing = 0;
let failed = 0;

for (const r of rows) {
  try {
    const detail = await adapter.fetchDetail(r.email_id, false);
    if (Object.keys(detail.headers).length === 0) {
      console.warn(`  - ${r.email_id}: still no headers from Gmail (likely already purged from trash)`);
      missing++;
      continue;
    }
    update.run(JSON.stringify(detail.headers), JSON.stringify(detail.label_ids), r.id);
    const subject = detail.headers.Subject ?? '(no subject)';
    console.log(`  ✓ ${r.email_id}  ${subject.slice(0, 60)}`);
    ok++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ! ${r.email_id}: ${msg}`);
    failed++;
  }
}

console.log(`\nDone. updated=${ok} still-missing=${missing} failed=${failed}`);
process.exit(0);
