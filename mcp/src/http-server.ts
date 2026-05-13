// HTTP server wrapping Mafia's MCP tools.
//
// Lets web clients (notably the `vault-view` Lovable prototype) hit the same
// tool functions that the stdio MCP server exposes — same Zod schemas, same
// handlers. CORS is open to localhost:8080 (vault-view's Vite dev port).
//
// Run:
//   npm run server:http        # default port 3334
//   MAFIA_HTTP_PORT=4000 npm run server:http
//
// Endpoints map 1:1 to MCP tools:
//   POST /api/fetch-emails        → fetchEmailsTool
//   POST /api/summarize-email     → summarizeEmailTool
//   POST /api/top-senders         → topSendersTool
//   POST /api/act-on-email        → actOnEmailTool
//   POST /api/commit-session      → commitSessionTool
//   POST /api/list-vault          → listVaultTool
//   POST /api/restore             → restoreTool
//   POST /api/clear-vault         → clearVaultTool
//   POST /api/stats               → getSessionStatsTool
//   GET  /api/daily-brief         → dailyBriefHandler (resource, not a tool)
//   GET  /api/health              → liveness check

import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { z, type ZodTypeAny } from 'zod';

import { fetchEmailsSchema, fetchEmailsTool } from './tools/fetch-emails.js';
import { summarizeEmailSchema, summarizeEmailTool } from './tools/summarize-email.js';
import { topSendersSchema, topSendersTool } from './tools/top-senders.js';
import { actOnEmailSchema, actOnEmailTool } from './tools/act-on-email.js';
import { commitSessionSchema, commitSessionTool } from './tools/commit-session.js';
import { listVaultSchema, listVaultTool } from './tools/list-vault.js';
import { restoreSchema, restoreTool } from './tools/restore.js';
import { clearVaultSchema, clearVaultTool } from './tools/clear-vault.js';
import { getSessionStatsSchema, getSessionStatsTool } from './tools/get-stats.js';
import { dailyBriefHandler, DAILY_BRIEF_URI } from './resources/daily-brief.js';

import { getFirstUser } from './db/index.js';

/**
 * Build the Fastify app. Exported so tests can spin up an instance without
 * binding a port, and so a future caller can mount it inside another server.
 */
export async function buildHttpServer(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 5 * 1024 * 1024, // 5 MB — generous for email payloads in the future
  });

  await app.register(cors, {
    origin: [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      // vault-view's Vite dev server can also bind to other ports if 8080 is taken;
      // be permissive in dev and tighten in production deployment.
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  });

  // ── Liveness / identity ──────────────────────────────────────────────────

  app.get('/api/health', async () => {
    const user = getFirstUser();
    return {
      ok: true,
      version: '0.2.0',
      authenticated: !!user?.access_token,
      user_email: user?.email ?? null,
    };
  });

  // ── Tools ────────────────────────────────────────────────────────────────

  bindTool(app, '/api/fetch-emails', fetchEmailsSchema, fetchEmailsTool);
  bindTool(app, '/api/summarize-email', summarizeEmailSchema, summarizeEmailTool);
  bindTool(app, '/api/top-senders', topSendersSchema, topSendersTool);
  bindTool(app, '/api/act-on-email', actOnEmailSchema, actOnEmailTool);
  bindTool(app, '/api/commit-session', commitSessionSchema, commitSessionTool);
  bindTool(app, '/api/list-vault', listVaultSchema, listVaultTool);
  bindTool(app, '/api/restore', restoreSchema, restoreTool);
  bindTool(app, '/api/clear-vault', clearVaultSchema, clearVaultTool);
  bindTool(app, '/api/stats', getSessionStatsSchema, getSessionStatsTool);

  // ── Resources ────────────────────────────────────────────────────────────

  app.get('/api/daily-brief', async () => {
    return await dailyBriefHandler(new URL(DAILY_BRIEF_URI));
  });

  // ── Error handler ────────────────────────────────────────────────────────

  app.setErrorHandler((err, _req, reply) => {
    // Validation errors (from bindTool) already set status; this catches
    // unexpected throws inside tool handlers (Gmail upstream failures etc).
    const anyErr = err as { statusCode?: number; code?: string; message?: string };
    const status = anyErr.statusCode ?? 500;
    reply.code(status).send({
      error: anyErr.message ?? 'Internal error',
      code: anyErr.code ?? 'INTERNAL',
    });
  });

  return app;
}

/**
 * Bind a single Zod-validated tool to a POST endpoint. Validation errors
 * return 400; tool errors bubble up to the error handler.
 */
function bindTool<S extends ZodTypeAny>(
  app: FastifyInstance,
  path: string,
  schema: S,
  fn: (input: z.infer<S>) => Promise<unknown>,
) {
  app.post(path, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid input', issues: parsed.error.issues };
    }
    return await fn(parsed.data);
  });
}

// Run as a standalone server when invoked directly (npm run server:http).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.MAFIA_HTTP_PORT ?? 3334);
  const host = process.env.MAFIA_HTTP_HOST ?? '127.0.0.1';
  const app = await buildHttpServer({ logger: true });
  app
    .listen({ port, host })
    .then(() => {
      console.error(`Mafia HTTP server listening on http://${host}:${port}`);
      console.error('CORS allows http://localhost:8080 (vault-view) + any localhost port.');
    })
    .catch((err: unknown) => {
      console.error('Mafia HTTP server failed to start:', err);
      process.exit(1);
    });
}
