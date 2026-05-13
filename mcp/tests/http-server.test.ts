// HTTP-server-shape tests. Uses Fastify's `inject` so no port is bound;
// tests are fast and isolated. Tool handlers themselves are exercised by
// their own test files — these tests only verify the HTTP plumbing
// (routing, CORS, validation, error handling).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildHttpServer } from '../src/http-server.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildHttpServer({ logger: false });
});

afterAll(async () => {
  await app.close();
});

describe('http-server: liveness', () => {
  it('GET /api/health returns ok + version', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBe('0.2.0');
    // `authenticated` and `user_email` are environment-dependent — just
    // confirm the keys exist.
    expect('authenticated' in body).toBe(true);
    expect('user_email' in body).toBe(true);
  });
});

describe('http-server: tool routing', () => {
  // Note: `/api/top-senders` is intentionally excluded from this fast routing
  // check — its empty-body default scans 500 Gmail messages (real network),
  // which exceeds the per-test timeout. It's covered separately by the curl
  // smoke (run manually) and by the live `top-senders.test.ts` integration.
  const tools = [
    '/api/fetch-emails',
    '/api/summarize-email',
    '/api/act-on-email',
    '/api/commit-session',
    '/api/list-vault',
    '/api/restore',
    '/api/clear-vault',
    '/api/stats',
  ];

  for (const path of tools) {
    it(`${path} exists and accepts POST`, async () => {
      // Empty body — most schemas have defaults / are partially optional, so
      // this exercises the route without requiring valid auth. The point is
      // to verify the route is registered, not that the tool succeeds.
      const res = await app.inject({
        method: 'POST',
        url: path,
        headers: { 'content-type': 'application/json' },
        payload: {},
      });
      // 200 (default-fill validated), 400 (validation rejected), or 500 (no
      // user / Gmail down) are all "route is wired" — only 404 would mean
      // we forgot to register it.
      expect([200, 400, 500].includes(res.statusCode)).toBe(true);
    });
  }

  it('returns 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/this-does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});

describe('http-server: input validation', () => {
  it('rejects invalid restore input with 400 + zod issues', async () => {
    // restoreSchema requires at least one of action_id / email_id / batch_action_ids
    // — empty body should fail validation OR return a tool-level error.
    // Either way, sending malformed top-level JSON should be a 400.
    const res = await app.inject({
      method: 'POST',
      url: '/api/restore',
      headers: { 'content-type': 'application/json' },
      payload: { action_id: 12345 }, // wrong type — schema wants string
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Invalid input');
    expect(body.issues).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('rejects clear-vault with out-of-range older_than_days', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/clear-vault',
      headers: { 'content-type': 'application/json' },
      payload: { older_than_days: 999 }, // schema max is 30
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid input');
  });
});

describe('http-server: CORS', () => {
  it('responds to OPTIONS preflight from localhost:8080', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:8080',
        'access-control-request-method': 'GET',
      },
    });
    // @fastify/cors returns 204 No Content for successful preflight
    expect([200, 204].includes(res.statusCode)).toBe(true);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
  });

  it('responds to OPTIONS preflight from arbitrary localhost port', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
      },
    });
    expect([200, 204].includes(res.statusCode)).toBe(true);
    // Regex-matched origin echoes back
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does NOT allow non-localhost origins (defense in depth)', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://evil.example.com',
        'access-control-request-method': 'GET',
      },
    });
    // @fastify/cors with array origin → unmatched origins get no
    // Access-Control-Allow-Origin header (or empty). The preflight itself
    // may still succeed at HTTP level; the browser is the gate.
    expect(res.headers['access-control-allow-origin']).toBeFalsy();
  });
});

describe('http-server: daily-brief resource', () => {
  it('GET /api/daily-brief returns the resource', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/daily-brief' });
    // Either succeeds with a brief, or returns a structured error from the
    // handler (e.g. no user). Both are valid — we only care the route is wired.
    expect([200, 500].includes(res.statusCode)).toBe(true);
  });
});
