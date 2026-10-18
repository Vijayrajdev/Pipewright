import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { CHAT_SYSTEM, schemaToPrompt } from "@/lib/ai/prompts";
import { describeError, FALLBACK_PARAMS, getClient } from "@/lib/ai/client";
import { ollamaStream } from "@/lib/ai/ollama";
import { NO_PROVIDER_MESSAGE, resolveProvider } from "@/lib/ai/provider";
import { TableSchemaSchema } from "@/lib/schema/types";

const ChatRequest = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1),
  schema: TableSchemaSchema.nullish(),
});

const encoder = new TextEncoder();

/** Wrap an async text generator as a streamed plain-text response. */
function streamText(gen: (signal: AbortSignal) => AsyncGenerator<string>, onError: (e: unknown) => string) {
  const controller = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      try {
        for await (const chunk of gen(controller.signal)) c.enqueue(encoder.encode(chunk));
      } catch (error) {
        if (!controller.signal.aborted) c.enqueue(encoder.encode(`\n\n_${onError(error)}_`));
      }
      c.close();
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const provider = await resolveProvider();
  if (!provider) return Response.json({ error: NO_PROVIDER_MESSAGE }, { status: 503 });

  const parsed = ChatRequest.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }
  const { messages, schema } = parsed.data;
  const context = schema ? `The table you are working on:\n\n${schemaToPrompt(schema)}` : null;

  if (provider.kind === "ollama") {
    const system = [CHAT_SYSTEM, context].filter(Boolean).join("\n\n");
    return streamText(
      (signal) => ollamaStream(provider.model, [{ role: "system", content: system }, ...messages], signal),
      (e) => `Local model error: ${(e as Error).message}`,
    );
  }

  // The table context goes in the system prompt so it is stable across turns (cache-friendly).
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: CHAT_SYSTEM }];
  if (context) system.push({ type: "text", text: context });

  return streamText(
    async function* (signal) {
      const stream = getClient().beta.messages.stream(
        {
          model: provider.model,
          max_tokens: 64000,
          ...FALLBACK_PARAMS,
          output_config: { effort: "medium" },
          cache_control: { type: "ephemeral" },
          system,
          messages,
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") yield "\n\n_Claude declined to answer this request._";
      else if (final.stop_reason === "max_tokens") yield "\n\n_The answer was cut off at the length limit._";
    },
    (e) => describeError(e).message,
  );
}
