import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.PIPEWRIGHT_MODEL || "claude-opus-5-5";

/**
 * Server-side fallback: if the model declines for policy reasons, the API re-runs
 * the request on Anthropic's recommended substitute instead of returning a refusal.
 */
export const FALLBACK_PARAMS: Pick<Anthropic.Beta.MessageCreateParams, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Map SDK errors to a short, user-facing message and status. */
export function describeError(error: unknown): { message: string; status: number } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { message: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.", status: 401 };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { message: "Rate limited by the Anthropic API. Try again in a moment.", status: 429 };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { message: `The request was rejected: ${error.message}`, status: 400 };
  }
  if (error instanceof Anthropic.APIError) {
    return { message: `Anthropic API error (${error.status ?? "network"}). Try again.`, status: 502 };
  }
  return { message: "Something went wrong talking to Claude.", status: 500 };
}
