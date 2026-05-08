// JSONL append-only logger. One line per event.
//
// Designed to be used by both the eval runner (scenario testing) and an
// optional production logging path that wraps real tool calls.

import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface LogEvent {
  ts: string;
  scenario?: string;
  step?: number;
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
  duration_ms: number;
  ok: boolean;
}

export class JsonlLogger {
  private path: string;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
  }

  log(event: LogEvent): void {
    appendFileSync(this.path, JSON.stringify(event) + '\n', 'utf-8');
  }

  /**
   * Wrap an async function so every call is logged. Captures input args,
   * output, error, and duration.
   */
  wrap<TArgs extends unknown[], TOut>(
    name: string,
    fn: (...args: TArgs) => Promise<TOut>,
    context: Pick<LogEvent, 'scenario' | 'step'> = {},
  ): (...args: TArgs) => Promise<TOut> {
    return async (...args: TArgs): Promise<TOut> => {
      const start = Date.now();
      try {
        const out = await fn(...args);
        this.log({
          ts: new Date().toISOString(),
          tool: name,
          input: args[0] ?? null,
          output: out,
          duration_ms: Date.now() - start,
          ok: true,
          ...context,
        });
        return out;
      } catch (err) {
        this.log({
          ts: new Date().toISOString(),
          tool: name,
          input: args[0] ?? null,
          error: err instanceof Error ? err.message : String(err),
          duration_ms: Date.now() - start,
          ok: false,
          ...context,
        });
        throw err;
      }
    };
  }
}
