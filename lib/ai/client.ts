import "server-only";
import Anthropic from "@anthropic-ai/sdk";

import { DEFAULT_CLAUDE_MODEL } from "./shared";

export { FALLBACK_PARAMS } from "./shared";
export { describeError } from "./errors";

export const MODEL = process.env.PIPEWRIGHT_MODEL || DEFAULT_CLAUDE_MODEL;

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
