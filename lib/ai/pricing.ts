/**
 * Approximate $/M-token rates for cost estimation on the admin usage dashboard.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-08-27).
 * Anthropic can change these - treat admin cost figures as estimates, not invoices.
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

const FALLBACK_PRICING = { input: 3, output: 15 };

// Prompt-cache multipliers on top of a model's base input rate.
const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const CACHE_WRITE_1H_MULTIPLIER = 2;
const CACHE_READ_MULTIPLIER = 0.1;

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache?: { creation5mTokens?: number | null; creation1hTokens?: number | null; readTokens?: number | null },
): number {
  const rates = PRICING_PER_MTOK[model] ?? FALLBACK_PRICING;
  const base = (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
  if (!cache) return base;

  const creation5m = ((cache.creation5mTokens ?? 0) / 1_000_000) * rates.input * CACHE_WRITE_5M_MULTIPLIER;
  const creation1h = ((cache.creation1hTokens ?? 0) / 1_000_000) * rates.input * CACHE_WRITE_1H_MULTIPLIER;
  const read = ((cache.readTokens ?? 0) / 1_000_000) * rates.input * CACHE_READ_MULTIPLIER;
  return base + creation5m + creation1h + read;
}
