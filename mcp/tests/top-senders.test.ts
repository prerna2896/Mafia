// Unit tests for topSenders() in src/gmail/client.ts.
//
// Uses the test-only `__messagesApi` injection point on topSenders() to swap
// in a fake Gmail messages API — no googleapis or OAuth needed in tests.

import { describe, it, expect } from 'vitest';
import { topSenders, type GmailMessagesApi } from '../src/gmail/client.js';

type ListResp = Awaited<ReturnType<GmailMessagesApi['list']>>;
type GetResp = Awaited<ReturnType<GmailMessagesApi['get']>>;

function makeListPage(ids: string[], nextPageToken?: string): ListResp {
  return {
    data: {
      messages: ids.map((id) => ({ id, threadId: `t_${id}` })),
      nextPageToken: nextPageToken ?? null,
    },
  };
}

function makeGetResp(from: string, subject: string, size = 4096): GetResp {
  return {
    data: {
      payload: {
        headers: [
          { name: 'From', value: from },
          { name: 'Subject', value: subject },
          { name: 'Date', value: 'Mon, 1 Jan 2024 00:00:00 +0000' },
        ],
      },
      sizeEstimate: size,
    },
  };
}

/**
 * Build a fake GmailMessagesApi that replays a scripted list page and dispatches
 * to a per-id getter.
 */
function makeFake(
  pages: ListResp[],
  getById: (id: string) => GetResp,
): GmailMessagesApi {
  let pageIdx = 0;
  return {
    list: async () => {
      const p = pages[pageIdx] ?? { data: { messages: [], nextPageToken: null } };
      pageIdx += 1;
      return p;
    },
    get: async ({ id }) => getById(id),
  };
}

describe('topSenders', () => {
  it('aggregates by lowercased fromEmail and computes coverage', async () => {
    const ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    const corpus: Record<string, { from: string; subject: string }> = {
      m1: { from: 'Acme <hi@Acme.com>', subject: 'Sale 1' },
      m2: { from: 'Acme <hi@acme.com>', subject: 'Sale 2' },
      m3: { from: '"Acme Sales" <hi@acme.com>', subject: 'Sale 3' },
      m4: { from: 'beta@beta.io', subject: 'Update A' },
      m5: { from: 'beta@beta.io', subject: 'Update B' },
      m6: { from: 'Gamma <gamma@gamma.dev>', subject: 'Welcome' },
    };
    const fake = makeFake(
      [makeListPage(ids)],
      (id) => makeGetResp(corpus[id].from, corpus[id].subject),
    );

    const result = await topSenders('user1', { topN: 2, sampleSize: 10 }, fake);

    expect(result.totalScanned).toBe(6);
    expect(result.totalSendersFound).toBe(3);
    expect(result.topSenders).toHaveLength(2);
    expect(result.topSenders[0].fromEmail).toBe('hi@acme.com');
    expect(result.topSenders[0].count).toBe(3);
    expect(result.topSenders[0].percentOfScanned).toBe(50);
    expect(result.topSenders[0].sampleSubjects.length).toBeGreaterThan(0);
    expect(result.topSenders[0].sampleSubjects.length).toBeLessThanOrEqual(3);
    expect(result.topSenders[1].fromEmail).toBe('beta@beta.io');
    expect(result.topSenders[1].count).toBe(2);
    // Coverage: top 2 = 5 of 6 = 83.3%
    expect(result.coverage.topN_count).toBe(5);
    expect(result.coverage.topN_percent).toBeCloseTo(83.3, 1);
  });

  it('pages through list() until sampleSize is reached', async () => {
    let listCalls = 0;
    const fake: GmailMessagesApi = {
      list: async () => {
        listCalls += 1;
        if (listCalls === 1) return makeListPage(['m1', 'm2', 'm3'], 'pageA');
        return makeListPage(['m4', 'm5']);
      },
      get: async ({ id }) => makeGetResp(`u${id}@x.com`, `subj-${id}`),
    };

    const result = await topSenders('user1', { sampleSize: 5, topN: 10 }, fake);
    expect(result.totalScanned).toBe(5);
    expect(listCalls).toBe(2);
    expect(result.topSenders).toHaveLength(5);
  });

  it('returns empty result when Gmail has nothing to scan', async () => {
    const fake = makeFake([{ data: { messages: [], nextPageToken: null } }], () =>
      makeGetResp('x@y.com', 's'),
    );
    const result = await topSenders('user1', { sampleSize: 100 }, fake);
    expect(result.totalScanned).toBe(0);
    expect(result.totalSendersFound).toBe(0);
    expect(result.topSenders).toEqual([]);
    expect(result.coverage).toEqual({ topN_count: 0, topN_percent: 0 });
  });

  it('caps sampleSize at 2000 even if a caller asks for more', async () => {
    let callCount = 0;
    const fake: GmailMessagesApi = {
      list: async () => {
        callCount += 1;
        const ids = Array.from({ length: 500 }, (_, i) => `m_${callCount}_${i}`);
        return {
          data: {
            messages: ids.map((id) => ({ id, threadId: null })),
            nextPageToken: `tok${callCount}`,
          },
        };
      },
      get: async ({ id }) => makeGetResp('a@b.com', `s-${id}`, 1024),
    };

    const result = await topSenders('user1', { sampleSize: 99999 }, fake);
    expect(result.totalScanned).toBeLessThanOrEqual(2000);
    expect(result.totalScanned).toBeGreaterThan(0);
  });

  it('survives individual get() failures and still aggregates the rest', async () => {
    const fake: GmailMessagesApi = {
      list: async () => makeListPage(['m1', 'm2', 'm3']),
      get: async ({ id }) => {
        if (id === 'm2') throw new Error('mock 404');
        return makeGetResp('x@y.com', `s-${id}`);
      },
    };
    const result = await topSenders('user1', { sampleSize: 10 }, fake);
    expect(result.totalScanned).toBe(2);
    expect(result.topSenders[0].count).toBe(2);
  });

  it('estimatedKB sums sizeEstimate across messages for the same sender', async () => {
    const fake: GmailMessagesApi = {
      list: async () => makeListPage(['m1', 'm2']),
      get: async ({ id }) => makeGetResp('one@x.com', `s-${id}`, id === 'm1' ? 2048 : 4096),
    };
    const result = await topSenders('user1', { sampleSize: 10 }, fake);
    expect(result.topSenders[0].estimatedKB).toBe(Math.round((2048 + 4096) / 1024));
  });

  it('keeps at most 3 distinct sample subjects per sender', async () => {
    const fake: GmailMessagesApi = {
      list: async () => makeListPage(['m1', 'm2', 'm3', 'm4', 'm5']),
      get: async ({ id }) => {
        // 5 distinct subjects from the same sender
        return makeGetResp('many@x.com', `subj-${id}`);
      },
    };
    const result = await topSenders('user1', { sampleSize: 10 }, fake);
    expect(result.topSenders[0].sampleSubjects.length).toBe(3);
  });
});
