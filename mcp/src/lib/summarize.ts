import Anthropic from '@anthropic-ai/sdk';
import type { EmailMetadata } from '../gmail/client.js';

// ── Backend selection ─────────────────────────────────────────────────────────
//
// PRD §6.1 commits to "on-device-by-default." MAFIA_SUMMARY_BACKEND gates which
// summarization path runs:
//
//   - cloud (default when unset): call Anthropic Haiku — best quality, network.
//   - local: deterministic rule-based recommendation, no network call.
//   - off:   return a safe `keep` stub, no summarization at all.
//
// The default stays `cloud` for backward compatibility with users who have
// already wired up an ANTHROPIC_API_KEY.

export type SummaryBackend = 'cloud' | 'local' | 'off';

export function getBackend(): SummaryBackend {
  const raw = process.env.MAFIA_SUMMARY_BACKEND?.toLowerCase().trim();
  if (raw === 'local' || raw === 'off' || raw === 'cloud') return raw;
  return 'cloud';
}

let _client: Anthropic | null = null;

// Exported for tests: lets us spy on whether the cloud client was ever asked
// for. The `local` and `off` paths must never invoke this.
export function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface EmailSummary {
  emailId: string;
  subject: string;
  from: string;
  oneLiner: string;
  recommendedAction: 'keep' | 'delete' | 'archive';
  reasoning: string;
  backend: SummaryBackend;
}

export async function summarizeEmail(email: EmailMetadata, body?: string): Promise<EmailSummary> {
  const backend = getBackend();
  if (backend === 'off') return summarizeOff(email);
  if (backend === 'local') return summarizeLocal(email);
  return summarizeCloud(email, body);
}

// ── `off` backend ─────────────────────────────────────────────────────────────

function summarizeOff(email: EmailMetadata): EmailSummary {
  return {
    emailId: email.id,
    subject: email.subject,
    from: `${email.from} <${email.fromEmail}>`,
    oneLiner: oneLinerFromSnippet(email.snippet),
    recommendedAction: 'keep',
    reasoning:
      'MAFIA_SUMMARY_BACKEND=off — summarization disabled. Triage manually using fetch_emails + act_on_email.',
    backend: 'off',
  };
}

// ── `local` backend (rule-based) ──────────────────────────────────────────────

const AUTOMATED_SENDER_RE = /^(no-?reply|donotreply|notifications?|mailer-daemon|bounce|automated)@/i;

const DELETE_KEYWORDS: string[] = [
  'unsubscribe',
  '% off',
  'sale ends',
  'limited time',
  'flash sale',
  'newsletter',
  'digest',
  'weekly recap',
  'your update',
  'promo code',
  'deal of the',
];

const TRANSACTIONAL_DOMAINS: ReadonlySet<string> = new Set([
  'amazon.com',
  'amazon.in',
  'stripe.com',
  'uber.com',
  'doordash.com',
  'airbnb.com',
  'lyft.com',
  'paypal.com',
  'apple.com',
  'google.com',
]);

const ARCHIVE_KEYWORDS: string[] = [
  'receipt',
  'order #',
  'your order',
  'confirmation',
  'invoice',
  'payment received',
  'your trip',
  'booking',
];

function extractDomain(fromEmail: string): string {
  const at = fromEmail.lastIndexOf('@');
  if (at < 0) return '';
  return fromEmail.slice(at + 1).toLowerCase().trim();
}

function findKeyword(haystack: string, needles: string[]): string | null {
  const h = haystack.toLowerCase();
  for (const n of needles) {
    if (h.includes(n)) return n;
  }
  return null;
}

function summarizeLocal(email: EmailMetadata): EmailSummary {
  const from = `${email.from} <${email.fromEmail}>`;
  const haystack = `${email.subject}\n${email.snippet}`;
  const fromEmail = email.fromEmail ?? '';

  // delete rules first (more specific / stronger signal)
  if (AUTOMATED_SENDER_RE.test(fromEmail)) {
    return {
      emailId: email.id,
      subject: email.subject,
      from,
      oneLiner: oneLinerFromSnippet(email.snippet),
      recommendedAction: 'delete',
      reasoning: `Sender \`${fromEmail}\` matches automated-sender pattern → delete (rule-based, no AI).`,
      backend: 'local',
    };
  }

  const deleteKw = findKeyword(haystack, DELETE_KEYWORDS);
  if (deleteKw) {
    return {
      emailId: email.id,
      subject: email.subject,
      from,
      oneLiner: oneLinerFromSnippet(email.snippet),
      recommendedAction: 'delete',
      reasoning: `Subject/snippet contains marketing phrase "${deleteKw}" → delete (rule-based, no AI).`,
      backend: 'local',
    };
  }

  // archive rules
  const domain = extractDomain(fromEmail);
  if (domain && TRANSACTIONAL_DOMAINS.has(domain)) {
    return {
      emailId: email.id,
      subject: email.subject,
      from,
      oneLiner: oneLinerFromSnippet(email.snippet),
      recommendedAction: 'archive',
      reasoning: `Sender domain ${domain} is in the transactional allowlist → archive (rule-based, no AI).`,
      backend: 'local',
    };
  }

  const archiveKw = findKeyword(haystack, ARCHIVE_KEYWORDS);
  if (archiveKw) {
    return {
      emailId: email.id,
      subject: email.subject,
      from,
      oneLiner: oneLinerFromSnippet(email.snippet),
      recommendedAction: 'archive',
      reasoning: `Subject/snippet contains transactional phrase "${archiveKw}" → archive (rule-based, no AI).`,
      backend: 'local',
    };
  }

  // fallthrough: keep
  return {
    emailId: email.id,
    subject: email.subject,
    from,
    oneLiner: oneLinerFromSnippet(email.snippet),
    recommendedAction: 'keep',
    reasoning: 'No marketing or transactional patterns matched → keep (rule-based, no AI).',
    backend: 'local',
  };
}

// Pull first sentence from snippet (split on sentence-ending punctuation+space),
// trim to ~15 words, append ellipsis when truncated.
export function oneLinerFromSnippet(snippet: string): string {
  const cleaned = (snippet ?? '').trim();
  if (!cleaned) return '';
  // split on ". ", "! ", "? " — keep first chunk
  const sentenceMatch = cleaned.split(/[.!?]\s/, 1)[0] ?? cleaned;
  const first = sentenceMatch.trim();
  const words = first.split(/\s+/);
  if (words.length <= 15) {
    // If we trimmed by splitting on punctuation, the original was longer than
    // one sentence — indicate continuation. Otherwise return as-is.
    const truncatedBySentence = sentenceMatch.length < cleaned.length;
    return truncatedBySentence ? `${first}…` : first;
  }
  return `${words.slice(0, 15).join(' ')}…`;
}

// ── `cloud` backend (Anthropic Haiku) ─────────────────────────────────────────

async function summarizeCloud(email: EmailMetadata, body?: string): Promise<EmailSummary> {
  const client = getClient();

  const prompt = `You are helping the user triage their email inbox. Analyze this email and respond with JSON only.

Email:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Date: ${email.date}
Preview: ${email.snippet}
${body ? `Body excerpt: ${body.slice(0, 500)}` : ''}

Respond with this exact JSON (no markdown, no explanation):
{
  "oneLiner": "one sentence max 15 words describing what this email is about",
  "recommendedAction": "keep" | "delete" | "archive",
  "reasoning": "one sentence explaining your recommendation"
}

Guidelines:
- delete: newsletters, promotions, automated notifications, marketing, things you'd never re-read
- archive: receipts, confirmations, useful info but not actionable, things worth keeping for reference
- keep: requires action, is from a real person, is important or time-sensitive`;

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content[0].type === 'text' ? res.content[0].text : '{}';

  try {
    const parsed = JSON.parse(text.trim());
    return {
      emailId: email.id,
      subject: email.subject,
      from: `${email.from} <${email.fromEmail}>`,
      oneLiner: parsed.oneLiner ?? email.snippet.slice(0, 80),
      recommendedAction: parsed.recommendedAction ?? 'archive',
      reasoning: parsed.reasoning ?? '',
      backend: 'cloud',
    };
  } catch {
    return {
      emailId: email.id,
      subject: email.subject,
      from: `${email.from} <${email.fromEmail}>`,
      oneLiner: email.snippet.slice(0, 80),
      recommendedAction: 'archive',
      reasoning: 'Could not parse summary',
      backend: 'cloud',
    };
  }
}

export async function summarizeBatch(emails: EmailMetadata[]): Promise<EmailSummary[]> {
  // Run in parallel, max 5 concurrent to respect rate limits
  const results: EmailSummary[] = [];
  const chunks = chunkArray(emails, 5);
  for (const chunk of chunks) {
    const summaries = await Promise.all(chunk.map(e => summarizeEmail(e)));
    results.push(...summaries);
  }
  return results;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
