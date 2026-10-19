import { describe, expect, it } from "vitest";
import { chatPrompt, claudeChatParams, describeCopyPrompt, parseDescriptions } from "@/lib/ai/shared";
import { isLocalUrl, looksLikeKey, maskKey } from "@/lib/ai/settings";
import { isChatModel, KEY_PROVIDERS, pickModel, providerById } from "@/lib/ai/providers";
import { ownKeyEngine, verifyKey } from "@/lib/ai/engines";
import { afterEach, vi } from "vitest";
import type { TableSchema } from "@/lib/schema/types";

const schema: TableSchema = {
  name: "orders",
  dataset: "shop",
  fields: [
    { name: "order_id", type: "int", nullable: false },
    { name: "email", type: "string", nullable: true },
  ],
};

describe("own-key safety rules", () => {
  it("only accepts Anthropic-shaped keys and masks them for display", () => {
    expect(looksLikeKey("anthropic", "sk-ant-api03-" + "a".repeat(40))).toBe(true);
    expect(looksLikeKey("anthropic", "sk-proj-" + "a".repeat(40))).toBe(false);
    expect(looksLikeKey("anthropic", "sk-ant-short")).toBe(false);
    expect(looksLikeKey("openai", "sk-proj-" + "a".repeat(40))).toBe(true);
    expect(looksLikeKey("google", "AIza" + "b".repeat(35))).toBe(true);
    expect(looksLikeKey("google", "sk-" + "b".repeat(35))).toBe(false);
    expect(looksLikeKey("groq", "gsk_" + "c".repeat(40))).toBe(true);
    expect(looksLikeKey("openrouter", "sk-or-v1-" + "d".repeat(40))).toBe(true);
    const masked = maskKey("sk-ant-api03-" + "x".repeat(40) + "WXYZ");
    expect(masked).toBe("sk-ant-api…WXYZ");
    expect(masked).not.toContain("xxxx");
  });

  it("lets Ollama point only at this computer", () => {
    expect(isLocalUrl("http://localhost:11434")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:8080")).toBe(true);
    expect(isLocalUrl("https://evil.example.com")).toBe(false);
    expect(isLocalUrl("http://localhost.evil.com:11434")).toBe(false);
    expect(isLocalUrl("http://192.168.1.5:11434")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });
});

describe("shared AI requests", () => {
  it("builds the same Claude request for the server and the browser", () => {
    const p = claudeChatParams("claude-opus-5-5", [{ role: "user", content: "dedupe it" }], schema);
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.system).toHaveLength(2);
    expect(p.system[1].text).toContain("Table: shop.orders");
    expect(p.betas).toContain("server-side-fallback-2026-07-01");
  });

  it("writes copy-a-prompt text with context and no data rows", () => {
    const text = chatPrompt(
      [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "write a MERGE" },
      ],
      schema,
    );
    expect(text).toContain("Table: shop.orders");
    expect(text).toContain("Me: first question");
    expect(text).toContain("You: first answer");
    expect(text.trim().endsWith("write a MERGE")).toBe(true);
    expect(describeCopyPrompt(schema)).toContain('{"columns":[{"path":"column_name"');
  });

  it("reads pasted-back answers in the shapes chat apps produce", () => {
    const json = '{"columns":[{"path":"email","description":"Customer email.","pii":true}]}';
    expect(parseDescriptions(json)?.columns[0].pii).toBe(true);
    expect(parseDescriptions("Here you go:\n```json\n" + json + "\n```\nAnything else?")?.columns).toHaveLength(1);
    expect(parseDescriptions("Sure! " + json + " Hope that helps.")?.columns[0].path).toBe("email");
    expect(parseDescriptions("no json here")).toBeNull();
  });
});

describe("bring-your-own-key providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  const sseResponse = (events: string[]) =>
    new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(e)); c.close(); } }), { status: 200 });

  it("covers the major providers, each with its own https origin", () => {
    expect(KEY_PROVIDERS.map((p) => p.id)).toEqual(expect.arrayContaining(["anthropic", "openai", "google", "mistral", "groq", "deepseek", "xai", "openrouter"]));
    for (const p of KEY_PROVIDERS) {
      expect(p.origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      if (p.api !== "anthropic") expect(p.base.startsWith(p.origin)).toBe(true);
    }
  });

  it("picks a sensible default model and drops non-chat models", () => {
    expect(isChatModel("text-embedding-3-large")).toBe(false);
    expect(isChatModel("whisper-1")).toBe(false);
    expect(isChatModel("gpt-5")).toBe(true);
    expect(pickModel(providerById("openai"), ["gpt-4o", "gpt-5", "gpt-5.1", "gpt-5-mini"])).toBe("gpt-5.1");
    expect(pickModel(providerById("google"), ["gemini-2.5-flash", "gemini-2.5-pro"])).toBe("gemini-2.5-pro");
    expect(pickModel(providerById("groq"), ["mixtral", "llama-3.3-70b-versatile"])).toBe("llama-3.3-70b-versatile");
  });

  it("streams from an OpenAI-compatible API, sending the key only to that provider", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return sseResponse(['data: {"choices":[{"delta":{"content":"SELECT"}}]}\n\n', 'data: {"choices":[{"delta":{"content":" 1"}}]}\n\ndata: [DONE]\n\n']);
    });
    const engine = ownKeyEngine("groq", () => "gsk_secret", "llama-3.3-70b-versatile");
    let out = "";
    for await (const t of engine.chat([{ role: "user", content: "hi" }], schema, new AbortController().signal)) out += t;
    expect(out).toBe("SELECT 1");
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer gsk_secret");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0].content).toContain("Table: shop.orders");
  });

  it("calls Gemini with the key in a header, never in the URL", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return sseResponse(['data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n']);
    });
    const engine = ownKeyEngine("google", () => "AIzaSECRET", "gemini-2.5-pro");
    let out = "";
    for await (const t of engine.chat([{ role: "user", content: "hi" }], null, new AbortController().signal)) out += t;
    expect(out).toBe("Hello");
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse");
    expect(calls[0].url).not.toContain("AIza");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIzaSECRET");
  });

  it("checks a key by listing its chat models, and explains a rejected key", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer sk-good"
        ? Response.json({ data: [{ id: "gpt-5" }, { id: "text-embedding-3-small" }, { id: "gpt-4o" }] })
        : Response.json({ error: { message: "Incorrect API key provided" } }, { status: 401 });
    });
    expect(await verifyKey("openai", "sk-good")).toEqual({ ok: true, models: ["gpt-5", "gpt-4o"] });
    const bad = await verifyKey("openai", "sk-bad");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.message).toContain("Your OpenAI key was rejected");
  });

  it("reads structured descriptions from an OpenAI-compatible reply", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ choices: [{ message: { content: '{"columns":[{"path":"email","description":"Buyer email.","pii":true}]}' } }] }));
    const result = await ownKeyEngine("openai", () => "sk-x", "gpt-5").describe(schema);
    expect(result.columns[0]).toEqual({ path: "email", description: "Buyer email.", pii: true });
  });
});
