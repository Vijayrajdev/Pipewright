import Anthropic from "@anthropic-ai/sdk";

/**
 * Map SDK errors to a short, user-facing message and status.
 * `own` = the visitor's own key (browser) rather than the host's (.env.local).
 */
export function describeError(error: unknown, own = false): { message: string; status: number } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { message: own ? "Your Anthropic API key was rejected. Check it in AI settings." : "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.", status: 401 };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { message: "This API key isn't allowed to use that model. Pick another model in AI settings.", status: 403 };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { message: "Rate limited by the Anthropic API. Try again in a moment.", status: 429 };
  }
  if (error instanceof Anthropic.BadRequestError) {
    // e.g. no credit left on the account
    return { message: `The request was rejected: ${error.message}`, status: 400 };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { message: "Couldn't reach the Anthropic API. Check your connection.", status: 502 };
  }
  if (error instanceof Anthropic.APIError) {
    return { message: `Anthropic API error (${error.status ?? "network"}). Try again.`, status: 502 };
  }
  return { message: "Something went wrong talking to Claude.", status: 500 };
}
