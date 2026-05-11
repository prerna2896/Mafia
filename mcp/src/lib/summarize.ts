import Anthropic from '@anthropic-ai/sdk';
import type { EmailMetadata } from '../gmail/client.js';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
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
}

export async function summarizeEmail(email: EmailMetadata, body?: string): Promise<EmailSummary> {
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
    };
  } catch {
    return {
      emailId: email.id,
      subject: email.subject,
      from: `${email.from} <${email.fromEmail}>`,
      oneLiner: email.snippet.slice(0, 80),
      recommendedAction: 'archive',
      reasoning: 'Could not parse summary',
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
