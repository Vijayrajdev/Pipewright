import "server-only";
import { isAiConfigured, MODEL } from "./client";
import { ollamaModel } from "./ollama";

export type Provider = { kind: "anthropic"; model: string } | { kind: "ollama"; model: string };

/**
 * Pick the AI backend: Claude when an Anthropic key is set (or AI_PROVIDER=anthropic),
 * otherwise a local Ollama model when one is running. null = AI off, rule-based tools only.
 */
export async function resolveProvider(): Promise<Provider | null> {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced !== "ollama" && isAiConfigured()) return { kind: "anthropic", model: MODEL };
  if (forced === "anthropic") return null;
  const local = await ollamaModel();
  return local ? { kind: "ollama", model: local } : null;
}

export const NO_PROVIDER_MESSAGE =
  "No AI model available. Install Ollama (free, runs locally) and run `ollama pull llama3.2`, or add ANTHROPIC_API_KEY to .env.local.";
