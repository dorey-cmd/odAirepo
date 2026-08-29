import Anthropic from "@anthropic-ai/sdk";

// The SDK's default request timeout is 10 minutes - too short for drafting a
// large multi-page contract's full node tree, which silently failed the
// whole turn with no visible error. 30 minutes covers even large documents.
export function createClaudeClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, timeout: 30 * 60 * 1000 });
}

export const DRAFTING_MODEL = "claude-sonnet-5";
export const EXTRACTION_MODEL = "claude-sonnet-5";
