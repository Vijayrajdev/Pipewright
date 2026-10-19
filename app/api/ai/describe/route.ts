import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DESCRIBE_SYSTEM } from "@/lib/ai/prompts";
import { describeError, FALLBACK_PARAMS, getClient } from "@/lib/ai/client";
import { Descriptions, describePrompt, type DescribeResponse } from "@/lib/ai/shared";
import { ollamaChat } from "@/lib/ai/ollama";
import { NO_PROVIDER_MESSAGE, resolveProvider } from "@/lib/ai/provider";
import { TableSchemaSchema } from "@/lib/schema/types";

export type { DescribeResponse };

export async function POST(request: Request) {
  const provider = await resolveProvider();
  if (!provider) return Response.json({ error: NO_PROVIDER_MESSAGE }, { status: 503 });

  const parsed = TableSchemaSchema.safeParse((await request.json())?.schema);
  if (!parsed.success) {
    return Response.json({ error: "Invalid schema in request." }, { status: 400 });
  }
  const schema = parsed.data;
  const prompt = describePrompt(schema);

  if (provider.kind === "ollama") {
    try {
      const text = await ollamaChat(
        provider.model,
        [
          { role: "system", content: DESCRIBE_SYSTEM },
          { role: "user", content: prompt },
        ],
        z.toJSONSchema(Descriptions),
      );
      const result = Descriptions.safeParse(JSON.parse(text));
      if (!result.success) {
        return Response.json({ error: `${provider.model} returned an unexpected shape. Try again or use a larger model.` }, { status: 502 });
      }
      return Response.json(result.data satisfies DescribeResponse);
    } catch (error) {
      return Response.json({ error: `Local model error: ${(error as Error).message}` }, { status: 502 });
    }
  }

  try {
    const response = await getClient().beta.messages.parse({
      model: provider.model,
      max_tokens: 16000,
      ...FALLBACK_PARAMS,
      output_config: { effort: "low", format: betaZodOutputFormat(Descriptions) },
      system: DESCRIBE_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") {
      return Response.json({ error: "Claude declined to describe this table." }, { status: 422 });
    }
    if (!response.parsed_output) {
      return Response.json({ error: "Claude's answer could not be parsed. Try again." }, { status: 502 });
    }
    return Response.json(response.parsed_output satisfies DescribeResponse);
  } catch (error) {
    const { message, status } = describeError(error);
    return Response.json({ error: message }, { status });
  }
}
