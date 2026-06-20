import Anthropic from "@anthropic-ai/sdk";

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
