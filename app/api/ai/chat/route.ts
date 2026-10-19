import { z } from "zod";
import { describeError, getClient } from "@/lib/ai/client";
import { claudeChatParams, plainSystem } from "@/lib/ai/shared";
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

  if (provider.kind === "ollama") {
    return streamText(
      (signal) => ollamaStream(provider.model, [{ role: "system", content: plainSystem(schema) }, ...messages], signal),
      (e) => `Local model error: ${(e as Error).message}`,
    );
  }

  return streamText(
    async function* (signal) {
      const stream = getClient().beta.messages.stream(claudeChatParams(provider.model, messages, schema), { signal });
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
