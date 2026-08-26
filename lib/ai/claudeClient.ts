import Anthropic from "@anthropic-ai/sdk";

export function createClaudeClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

export const DRAFTING_MODEL = "claude-sonnet-5";
export const EXTRACTION_MODEL = "claude-sonnet-5";
