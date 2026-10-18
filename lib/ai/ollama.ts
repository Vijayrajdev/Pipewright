import "server-only";

/**
 * Ollama runs open models (Llama, Qwen, Mistral…) locally for free.
 * Install from https://ollama.com, then e.g. `ollama pull llama3.2`.
 */
export const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The configured model if it's installed, else the first installed model; null when Ollama isn't running. */
export async function ollamaModel(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1200), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    if (!names.length) return null;
    const wanted = process.env.OLLAMA_MODEL;
    if (wanted) return names.find((n) => n === wanted || n.startsWith(`${wanted}:`)) ?? null;
    return names[0];
  } catch {
    return null;
  }
}

/** One-shot chat; pass a JSON schema as `format` for structured output. */
export async function ollamaChat(model: string, messages: OllamaMessage[], format?: object): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, ...(format ? { format, options: { temperature: 0 } } : {}) }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

/** Streaming chat: yields text chunks from Ollama's newline-delimited JSON stream. */
export async function* ollamaStream(model: string, messages: OllamaMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
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
}
