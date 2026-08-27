/**
 * Approximate $/M-token rates for cost estimation on the admin usage dashboard.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-08-27).
 * Anthropic can change these - treat admin cost figures as estimates, not invoices.
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
};

const FALLBACK_PRICING = { input: 3, output: 15 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING_PER_MTOK[model] ?? FALLBACK_PRICING;
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}
