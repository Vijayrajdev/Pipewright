import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { Field, TableSchema } from "@/lib/schema/types";
import { CHAT_SYSTEM, DESCRIBE_SYSTEM, schemaToPrompt } from "./prompts";

/*
 * Request shapes shared by every AI route: the server (host's key), the
 * browser (the user's own key, a local Ollama, an in-browser model) and the
 * copy-a-prompt fallback. One definition keeps their answers consistent.
 */

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "best answers" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "fast, lower cost" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hint: "fastest, lowest cost" },
] as const;
export const DEFAULT_CLAUDE_MODEL = CLAUDE_MODELS[0].id;

/**
 * Server-side fallback: if the model declines for policy reasons, the API re-runs
 * the request on Anthropic's recommended substitute instead of returning a refusal.
 */
export const FALLBACK_PARAMS: Pick<Anthropic.Beta.MessageCreateParams, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const Descriptions = z.object({
  columns: z.array(
    z.object({
      path: z.string().describe("Column path, e.g. 'amount' or 'shipping.city'"),
      description: z.string(),
      pii: z.boolean(),
    }),
  ),
});
export type DescribeResponse = z.infer<typeof Descriptions>;

export function columnPaths(fields: Field[], prefix = ""): string[] {
  return fields.flatMap((f) => {
    const p = prefix + f.name;
    return f.fields?.length ? [p, ...columnPaths(f.fields, `${p}.`)] : [p];
  });
}

export const describePrompt = (schema: TableSchema) =>
  `${schemaToPrompt(schema)}\n\nDescribe these column paths:\n${columnPaths(schema.fields).join("\n")}`;

export const tableContext = (schema: TableSchema | null | undefined) => (schema ? `The table you are working on:\n\n${schemaToPrompt(schema)}` : null);

/** Claude streaming chat request; the table context goes in the system prompt so it's stable across turns (cache-friendly). */
export function claudeChatParams(model: string, messages: ChatMessage[], schema?: TableSchema | null) {
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: CHAT_SYSTEM }];
  const context = tableContext(schema);
  if (context) system.push({ type: "text", text: context });
  return {
    model,
    max_tokens: 64000,
    ...FALLBACK_PARAMS,
    output_config: { effort: "medium" as const },
    cache_control: { type: "ephemeral" as const },
    system,
    messages,
  };
}

/** Plain system prompt (system + table) for models that take a single system message. */
export const plainSystem = (schema?: TableSchema | null) => [CHAT_SYSTEM, tableContext(schema)].filter(Boolean).join("\n\n");

/** Parse a model's JSON answer for descriptions; tolerates code fences and prose around the JSON. */
export function parseDescriptions(text: string): DescribeResponse | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidates = [text, fenced, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)].filter((c): c is string => !!c?.trim());
  for (const c of candidates) {
    try {
      const r = Descriptions.safeParse(JSON.parse(c));
      if (r.success) return r.data;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// ── copy-a-prompt: for people who'd rather use the AI chat they already have ──

/** One self-contained prompt to paste into any AI chat (Claude.ai, ChatGPT, Gemini, Copilot…). */
export function chatPrompt(messages: ChatMessage[], schema?: TableSchema | null): string {
  const history = messages.slice(0, -1);
  const last = messages.at(-1)?.content ?? "";
  return [
    plainSystem(schema),
    ...(history.length ? ["Conversation so far:", ...history.map((m) => `${m.role === "user" ? "Me" : "You"}: ${m.content}`)] : []),
    `My request:\n${last}`,
  ].join("\n\n");
}

export function describeCopyPrompt(schema: TableSchema): string {
  return [
    DESCRIBE_SYSTEM,
    describePrompt(schema),
    'Answer with JSON only, in exactly this shape: {"columns":[{"path":"column_name","description":"…","pii":false}]}',
  ].join("\n\n");
}
