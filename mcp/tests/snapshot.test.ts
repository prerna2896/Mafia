import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import {
  snapshotId,
  writeSnapshot,
  readSnapshot,
  readBody,
  dropBody,
} from '../src/quarantine/snapshot.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function fresh() {
  const { db, close } = makeTestDb();
  cleanup = close;
  return db;
}

describe('snapshot: content-addressable id', () => {
  it('id is deterministic for the same (email_id, internal_date)', () => {
    const a = snapshotId('msg123', 1700000000);
    const b = snapshotId('msg123', 1700000000);
    expect(a).toBe(b);
  });

  it('id changes if email_id or internal_date changes', () => {
    const base = snapshotId('msg123', 1700000000);
    expect(snapshotId('msg124', 1700000000)).not.toBe(base);
    expect(snapshotId('msg123', 1700000001)).not.toBe(base);
  });
});

describe('snapshot: hybrid storage', () => {
  it('archive intent stores headers + labels but no body blob', () => {
    const db = fresh();
    const id = writeSnapshot(db, 'archive', {
      email_id: 'msg1',
      internal_date: 1700000000,
      headers: { From: 'a@b.com', Subject: 'hi' },
      label_ids: ['INBOX', 'CATEGORY_PROMOTIONS'],
      body_raw: 'should be ignored for archive intent',
    });

    const snap = readSnapshot(db, id);
    expect(snap).not.toBeNull();
    expect(snap!.body_blob).toBeNull();
    expect(snap!.body_size_bytes).toBeNull();
    expect(JSON.parse(snap!.headers_json).From).toBe('a@b.com');
    expect(JSON.parse(snap!.label_ids_json)).toContain('INBOX');
  });

  it('delete intent stores gzipped body blob and exact size', () => {
    const db = fresh();
    const body = 'From: x@y.com\nSubject: spam\n\n' + 'lorem ipsum '.repeat(100);
    const id = writeSnapshot(db, 'delete', {
      email_id: 'msg2',
      internal_date: 1700000000,
      headers: { Subject: 'spam' },
      label_ids: ['INBOX'],
      body_raw: body,
    });

    const snap = readSnapshot(db, id);
    expect(snap!.body_blob).not.toBeNull();
    expect(snap!.body_size_bytes).toBe(Buffer.from(body, 'utf-8').length);
    // gzip should be smaller than raw for repetitive content
    expect(snap!.body_blob!.length).toBeLessThan(snap!.body_size_bytes!);

    const decoded = readBody(snap!);
    expect(decoded).toBe(body);
  });

  it('writeSnapshot is idempotent (same id, INSERT OR IGNORE)', () => {
    const db = fresh();
    const id1 = writeSnapshot(db, 'delete', {
      email_id: 'msg3',
      internal_date: 1700000000,
      headers: { Subject: 'A' },
      label_ids: [],
      body_raw: 'first',
    });
    const id2 = writeSnapshot(db, 'delete', {
      email_id: 'msg3',
      internal_date: 1700000000,
      headers: { Subject: 'B' }, // different headers
      label_ids: [],
      body_raw: 'second',
    });
    expect(id1).toBe(id2);
    // First write wins
    const snap = readSnapshot(db, id1);
    expect(JSON.parse(snap!.headers_json).Subject).toBe('A');
  });

  it('dropBody nulls the blob but keeps size and headers', () => {
    const db = fresh();
    const id = writeSnapshot(db, 'delete', {
      email_id: 'msg4',
      internal_date: 1700000000,
      headers: { From: 'old@news.com' },
      label_ids: [],
      body_raw: 'gone soon',
    });
    dropBody(db, id);
    const snap = readSnapshot(db, id);
    expect(snap!.body_blob).toBeNull();
    expect(snap!.body_size_bytes).toBe(Buffer.from('gone soon', 'utf-8').length);
    expect(JSON.parse(snap!.headers_json).From).toBe('old@news.com');
  });
});
