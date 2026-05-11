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
    const bodyBuf = Buffer.from(body, 'utf-8');
    const id = writeSnapshot(db, 'delete', {
      email_id: 'msg2',
      internal_date: 1700000000,
      headers: { Subject: 'spam' },
      label_ids: ['INBOX'],
      body_raw: bodyBuf.toString('base64url'),
    });

    const snap = readSnapshot(db, id);
    expect(snap!.body_blob).not.toBeNull();
    // body_size_bytes is the *decoded* email size, not the base64 length.
    expect(snap!.body_size_bytes).toBe(bodyBuf.length);
    // gzip should be smaller than raw for repetitive content
    expect(snap!.body_blob!.length).toBeLessThan(snap!.body_size_bytes!);

    const decoded = readBody(snap!);
    expect(decoded).not.toBeNull();
    expect(decoded!.equals(bodyBuf)).toBe(true);
  });

  it('non-ASCII RFC822 body round-trips byte-faithfully', () => {
    const db = fresh();
    // UTF-8 subject + body with non-ASCII bytes — the kind of thing utf-8
    // string handling would either preserve (lucky) or mangle on edge cases.
    const body =
      'From: x@y.com\r\nSubject: Café résumé — naïve façade\r\n\r\n' +
      'Pingüino: 🐧 (multi-byte). Some bytes: ' +
      Buffer.from([0xc3, 0xa9, 0xe2, 0x98, 0x83]).toString('utf-8');
    const bodyBuf = Buffer.from(body, 'utf-8');
    const encoded = bodyBuf.toString('base64url');
    const id = writeSnapshot(db, 'delete', {
      email_id: 'msg-utf8',
      internal_date: 1700000000,
      headers: { Subject: 'utf8 test' },
      label_ids: ['INBOX'],
      body_raw: encoded,
    });

    const snap = readSnapshot(db, id);
    expect(snap!.body_size_bytes).toBe(bodyBuf.length);
    // base64 encoding inflates ~33%, so the encoded length must be larger
    // than the stored size — proves we're decoding, not storing base64.
    expect(encoded.length).toBeGreaterThan(snap!.body_size_bytes!);

    const round = readBody(snap!);
    expect(round).not.toBeNull();
    expect(round!.equals(bodyBuf)).toBe(true);
  });

  it('writeSnapshot is idempotent (same id, INSERT OR IGNORE)', () => {
    const db = fresh();
    const id1 = writeSnapshot(db, 'delete', {
      email_id: 'msg3',
      internal_date: 1700000000,
      headers: { Subject: 'A' },
      label_ids: [],
      body_raw: Buffer.from('first', 'utf-8').toString('base64url'),
    });
    const id2 = writeSnapshot(db, 'delete', {
      email_id: 'msg3',
      internal_date: 1700000000,
      headers: { Subject: 'B' }, // different headers
      label_ids: [],
      body_raw: Buffer.from('second', 'utf-8').toString('base64url'),
    });
    expect(id1).toBe(id2);
    // First write wins
    const snap = readSnapshot(db, id1);
    expect(JSON.parse(snap!.headers_json).Subject).toBe('A');
  });

  it('dropBody nulls the blob but keeps size and headers', () => {
    const db = fresh();
    const bodyBytes = Buffer.from('gone soon', 'utf-8');
    const id = writeSnapshot(db, 'delete', {
      email_id: 'msg4',
      internal_date: 1700000000,
      headers: { From: 'old@news.com' },
      label_ids: [],
      body_raw: bodyBytes.toString('base64url'),
    });
    dropBody(db, id);
    const snap = readSnapshot(db, id);
    expect(snap!.body_blob).toBeNull();
    expect(snap!.body_size_bytes).toBe(bodyBytes.length);
    expect(JSON.parse(snap!.headers_json).From).toBe('old@news.com');
  });
});
