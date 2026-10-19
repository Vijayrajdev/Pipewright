"use client";

import { z } from "zod";
import type { TableSchema } from "@/lib/schema/types";
import { DESCRIBE_SYSTEM } from "./prompts";
import { claudeChatParams, describePrompt, Descriptions, FALLBACK_PARAMS, parseDescriptions, plainSystem, type ChatMessage, type DescribeResponse } from "./shared";
import { BROWSER_MODELS } from "./settings";
import { isChatModel, providerById, type KeyProvider, type ProviderId } from "./providers";

/**
 * One interface over every way Pipewright can reach a model. Except for
 * "server", each engine runs from the visitor's browser: their key goes
 * straight to Anthropic, Ollama is called on their own machine, and the
 * in-browser model never sends anything anywhere.
 */
export type EngineKind = "own-key" | "server" | "ollama" | "browser";

export interface Engine {
  kind: EngineKind;
  /** model name shown in the UI */
  model: string;
  /** true when the request never leaves this computer */
  onDevice: boolean;
  /** whose key, for own-key engines ("OpenAI", "Google"…) */
  vendor?: string;
  chat(messages: ChatMessage[], schema: TableSchema | null | undefined, signal: AbortSignal): AsyncGenerator<string>;
  describe(schema: TableSchema): Promise<DescribeResponse>;
}

// ── your own key, browser → that provider's API (and nowhere else) ──────

async function anthropic(key: string) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // The SDK refuses browser use by default because a key baked into a public
  // page would leak. Here the key is the visitor's own, typed into their own
  // browser and sent only to Anthropic, which is the case this flag is for.
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

function claudeEngine(key: () => string, model: string): Engine {
  return {
    kind: "own-key",
    model,
    onDevice: false,
    async *chat(messages, schema, signal) {
      const { describeError } = await import("./errors");
      try {
        const stream = (await anthropic(key())).beta.messages.stream(claudeChatParams(model, messages, schema), { signal });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") yield "\n\n_Claude declined to answer this request._";
        else if (final.stop_reason === "max_tokens") yield "\n\n_The answer was cut off at the length limit._";
      } catch (e) {
        if (signal.aborted) return;
        throw new Error(describeError(e, true).message);
      }
    },
    async describe(schema) {
      const [{ betaZodOutputFormat }, { describeError }] = await Promise.all([import("@anthropic-ai/sdk/helpers/beta/zod"), import("./errors")]);
      try {
        const response = await (await anthropic(key())).beta.messages.parse({
          model,
          max_tokens: 16000,
          ...FALLBACK_PARAMS,
          output_config: { effort: "low", format: betaZodOutputFormat(Descriptions) },
          system: DESCRIBE_SYSTEM,
          messages: [{ role: "user", content: describePrompt(schema) }],
        });
        if (response.stop_reason === "refusal") throw new Error("Claude declined to describe this table.");
        if (!response.parsed_output) throw new Error("Claude's answer could not be parsed. Try again.");
        return response.parsed_output;
      } catch (e) {
        if (e instanceof Error && /declined|parsed/.test(e.message)) throw e;
        throw new Error(describeError(e, true).message);
      }
    },
  };
}

/** Plain-English error from a provider's HTTP response. */
async function httpError(p: KeyProvider, res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string; message?: string } | null;
  const detail = (typeof body?.error === "string" ? body.error : body?.error?.message) ?? body?.message ?? "";
  if (res.status === 401 || res.status === 403) return new Error(`Your ${p.label} key was rejected${detail ? `: ${detail}` : "."} Check it in AI settings.`);
  if (res.status === 429) return new Error(`${p.label} says you're over your rate limit or quota. Wait a moment, or check your plan.`);
  if (res.status === 404) return new Error(`${p.label} doesn't have that model. Pick another in AI settings.`);
  return new Error(`${p.label} returned ${res.status}${detail ? `: ${detail}` : "."}`);
}

/** Read a server-sent-events body and yield each `data:` payload. */
async function* sse(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("data:")) yield t.slice(5).trim();
    }
  }
}

/** OpenAI's chat API, which OpenAI, Mistral, Groq, DeepSeek, xAI, Together and OpenRouter all speak. */
function openAiCompatEngine(p: KeyProvider, key: () => string, model: string): Engine {
  const post = (body: object, signal?: AbortSignal) =>
    fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify({ model, ...body }),
      signal,
    });
  return {
    kind: "own-key",
    model,
    onDevice: false,
    async *chat(messages, schema, signal) {
      const res = await post({ stream: true, messages: [{ role: "system", content: plainSystem(schema) }, ...messages] }, signal);
      if (!res.ok || !res.body) throw await httpError(p, res);
      for await (const data of sse(res)) {
        if (data === "[DONE]") return;
        const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
        if (chunk.error) throw new Error(chunk.error.message ?? `${p.label} stopped with an error.`);
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      }
    },
    async describe(schema) {
      const messages = [
        { role: "system", content: DESCRIBE_SYSTEM },
        { role: "user", content: `${describePrompt(schema)}\n\n${JSON_SHAPE}` },
      ];
      let res = await post({ messages, ...(p.jsonMode ? { response_format: { type: "json_object" } } : {}) });
      // some models behind a compatible API don't take response_format; ask again without it
      if (res.status === 400 && p.jsonMode) res = await post({ messages });
      if (!res.ok) throw await httpError(p, res);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const parsed = parseDescriptions(data.choices?.[0]?.message?.content ?? "");
      if (!parsed) throw new Error(`${model} returned an unexpected shape. Try again or pick a larger model.`);
      return parsed;
    },
  };
}

/** Google's Gemini API. */
function geminiEngine(p: KeyProvider, key: () => string, model: string): Engine {
  const post = (method: string, body: object, signal?: AbortSignal) =>
    fetch(`${p.base}/models/${encodeURIComponent(model)}:${method}`, {
      method: "POST",
      // the key goes in a header, never in the URL, so it can't end up in logs or history
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify(body),
      signal,
    });
  const contents = (messages: ChatMessage[]) => messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  type Reply = { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; error?: { message?: string } };
  const text = (r: Reply) => r.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
  return {
    kind: "own-key",
    model,
    onDevice: false,
    async *chat(messages, schema, signal) {
      const res = await post("streamGenerateContent?alt=sse", { systemInstruction: { parts: [{ text: plainSystem(schema) }] }, contents: contents(messages) }, signal);
      if (!res.ok || !res.body) throw await httpError(p, res);
      for await (const data of sse(res)) {
        const chunk = JSON.parse(data) as Reply;
        if (chunk.error) throw new Error(chunk.error.message ?? "Gemini stopped with an error.");
        const t = text(chunk);
        if (t) yield t;
        if (chunk.candidates?.[0]?.finishReason === "SAFETY") yield "\n\n_Gemini declined to answer this request._";
      }
    },
    async describe(schema) {
      const res = await post("generateContent", {
        systemInstruction: { parts: [{ text: DESCRIBE_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `${describePrompt(schema)}\n\n${JSON_SHAPE}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      });
      if (!res.ok) throw await httpError(p, res);
      const parsed = parseDescriptions(text((await res.json()) as Reply));
      if (!parsed) throw new Error(`${model} returned an unexpected shape. Try again.`);
      return parsed;
    },
  };
}

const JSON_SHAPE = 'Answer with JSON only, in exactly this shape: {"columns":[{"path":"column_name","description":"…","pii":false}]}';

/** An engine for the visitor's own key with the given provider. The key is read at call time, never stored on the engine. */
export function ownKeyEngine(id: ProviderId, getKey: (id: ProviderId) => string | null, model: string): Engine {
  const p = providerById(id);
  const key = () => {
    const k = getKey(id);
    if (!k) throw new Error(`Add your ${p.label} API key in AI settings.`);
    return k;
  };
  const engine = p.api === "anthropic" ? claudeEngine(key, model) : p.api === "gemini" ? geminiEngine(p, key, model) : openAiCompatEngine(p, key, model);
  return { ...engine, vendor: p.label };
}

/**
 * Check a key and get its chat models in one call (listing models is free on
 * every provider). Returns the models so the visitor can pick one.
 */
export async function verifyKey(id: ProviderId, key: string): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
  const p = providerById(id);
  try {
    let models: string[];
    if (p.api === "anthropic") {
      const client = await anthropic(key);
      models = [];
      for await (const m of client.models.list({ limit: 100 })) models.push(m.id);
    } else if (p.api === "gemini") {
      const res = await fetch(`${p.base}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
      if (!res.ok) throw await httpError(p, res);
      const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      models = (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
    } else {
      // OpenRouter lists models without a key, so check the key itself first
      if (p.id === "openrouter") {
        const check = await fetch(`${p.base}/key`, { headers: { Authorization: `Bearer ${key}` } });
        if (!check.ok) throw await httpError(p, check);
      }
      const res = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) throw await httpError(p, res);
      const data = (await res.json()) as { data?: { id: string }[] } | { id: string }[];
      models = (Array.isArray(data) ? data : (data.data ?? [])).map((m) => m.id);
    }
    models = models.filter(isChatModel);
    if (!models.length) return { ok: false, message: `The key works, but ${p.label} lists no chat models for it.` };
    return { ok: true, models };
  } catch (e) {
    if (p.api === "anthropic" && !(e instanceof Error && e.message.startsWith("Your"))) {
      const { describeError } = await import("./errors");
      return { ok: false, message: describeError(e, true).message };
    }
    const message = e instanceof TypeError ? `Couldn't reach ${p.label}. Check your connection.` : (e as Error).message;
    return { ok: false, message };
  }
}

// ── the host's server (ANTHROPIC_API_KEY or Ollama next to the server) ──

export function serverEngine(model: string): Engine {
  return {
    kind: "server",
    model,
    onDevice: false,
    async *chat(messages, schema, signal) {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, schema }),
        signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
      }
    },
    async describe(schema) {
      const res = await fetch("/api/ai/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schema }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      return data as DescribeResponse;
    },
  };
}

// ── Ollama on the visitor's own computer, called from the browser ────────

/** Installed models, or null when Ollama isn't reachable from this page. */
export async function probeOllama(url: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

export function ollamaEngine(url: string, model: string): Engine {
  const call = (body: object, signal?: AbortSignal) =>
    fetch(`${url}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, ...body }), signal });
  return {
    kind: "ollama",
    model,
    onDevice: true,
    async *chat(messages, schema, signal) {
      const res = await call({ stream: true, messages: [{ role: "system", content: plainSystem(schema) }, ...messages] }, signal);
      if (!res.ok || !res.body) throw new Error(`Ollama returned ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.message?.content) yield chunk.message.content;
        }
      }
    },
    async describe(schema) {
      const res = await call({
        stream: false,
        format: z.toJSONSchema(Descriptions),
        options: { temperature: 0 },
        messages: [
          { role: "system", content: DESCRIBE_SYSTEM },
          { role: "user", content: describePrompt(schema) },
        ],
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = (await res.json()) as { message?: { content?: string } };
      const parsed = parseDescriptions(data.message?.content ?? "");
      if (!parsed) throw new Error(`${model} returned an unexpected shape. Try again or use a larger model.`);
      return parsed;
    },
  };
}

// ── in-browser model (WebLLM on WebGPU): nothing leaves the device ────────

export interface BrowserModelState {
  status: "idle" | "loading" | "ready" | "error";
  model?: string;
  progress: number;
  text: string;
}

type WebEngine = Awaited<ReturnType<typeof import("@mlc-ai/web-llm")["CreateWebWorkerMLCEngine"]>>;

let webEngine: Promise<WebEngine> | null = null;
let webModel: string | null = null;
let browserState: BrowserModelState = { status: "idle", progress: 0, text: "" };
const stateListeners = new Set<() => void>();
const setBrowserState = (s: Partial<BrowserModelState>) => {
  browserState = { ...browserState, ...s };
  stateListeners.forEach((l) => l());
};
export const browserModelState = {
  subscribe: (cb: () => void) => {
    stateListeners.add(cb);
    return () => stateListeners.delete(cb);
  },
  get: () => browserState,
};

/** WebGPU is what makes in-browser models fast enough; without it we don't offer them. */
export async function webGpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

export async function browserModelCached(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import("@mlc-ai/web-llm");
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

export async function deleteBrowserModel(modelId: string) {
  const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
  await deleteModelAllInfoInCache(modelId);
  if (webModel === modelId) {
    (await webEngine?.catch(() => null))?.unload();
    webEngine = null;
    webModel = null;
    setBrowserState({ status: "idle", progress: 0, text: "", model: undefined });
  }
}

/** Download (first time only; then cached by the browser) and start the model. */
export function loadBrowserModel(modelId: string): Promise<WebEngine> {
  if (webEngine && webModel === modelId) return webEngine;
  const previous = webEngine;
  webModel = modelId;
  setBrowserState({ status: "loading", model: modelId, progress: 0, text: "Starting…" });
  const initProgressCallback = (r: { progress: number; text: string }) => setBrowserState({ progress: r.progress, text: r.text });
  webEngine = (async () => {
    const webllm = await import("@mlc-ai/web-llm");
    const old = await previous?.catch(() => null);
    if (old) {
      old.setInitProgressCallback(initProgressCallback);
      await old.reload(modelId);
      return old;
    }
    return webllm.CreateWebWorkerMLCEngine(new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" }), modelId, { initProgressCallback });
  })();
  webEngine.then(
    () => setBrowserState({ status: "ready", progress: 1, text: "Ready" }),
    (e: Error) => {
      webEngine = null;
      webModel = null;
      setBrowserState({ status: "error", text: e.message || "The model couldn't start on this device." });
    },
  );
  return webEngine;
}

export function browserEngine(modelId: string): Engine {
  const label = BROWSER_MODELS.find((m) => m.id === modelId)?.label ?? modelId;
  return {
    kind: "browser",
    model: label,
    onDevice: true,
    async *chat(messages, schema, signal) {
      const engine = await loadBrowserModel(modelId);
      const onAbort = () => engine.interruptGenerate();
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        const chunks = await engine.chat.completions.create({
          stream: true,
          temperature: 0.3,
          messages: [{ role: "system", content: plainSystem(schema) }, ...messages],
        });
        for await (const c of chunks) {
          const text = c.choices[0]?.delta?.content;
          if (text) yield text;
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
    async describe(schema) {
      const engine = await loadBrowserModel(modelId);
      const reply = await engine.chat.completions.create({
        temperature: 0,
        response_format: { type: "json_object", schema: JSON.stringify(z.toJSONSchema(Descriptions)) },
        messages: [
          { role: "system", content: DESCRIBE_SYSTEM },
          { role: "user", content: describePrompt(schema) },
        ],
      });
      const parsed = parseDescriptions(reply.choices[0]?.message?.content ?? "");
      if (!parsed) throw new Error(`${label} returned an unexpected shape. Try again or pick a larger model.`);
      return parsed;
    },
  };
}
