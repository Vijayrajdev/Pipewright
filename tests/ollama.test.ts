import { afterEach, describe, expect, it, vi } from "vitest";
import { ollamaChat, ollamaModel, ollamaStream } from "@/lib/ai/ollama";
import { resolveProvider } from "@/lib/ai/provider";

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      chunks.forEach((s) => c.enqueue(enc.encode(s)));
      c.close();
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ollama", () => {
  it("parses NDJSON split across network chunks", async () => {
    const lines = [
      '{"message":{"role":"assistant","content":"SELECT"},"done":false}\n{"message":{"role":"assi',
      'stant","content":" 1;"},"done":false}\n',
      '{"message":{"role":"assistant","content":""},"done":true,"eval_count":3}\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(lines))));
    let out = "";
    for await (const t of ollamaStream("llama3.2", [{ role: "user", content: "hi" }])) out += t;
    expect(out).toBe("SELECT 1;");
  });

  it("sends a JSON schema as format for structured output", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ message: { content: '{"ok":true}' }, done: true }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await ollamaChat("llama3.2", [{ role: "user", content: "x" }], { type: "object" });
    expect(JSON.parse(text)).toEqual({ ok: true });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: "llama3.2", stream: false, format: { type: "object" } });
  });

  it("picks the configured or first installed model, null when down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [{ name: "qwen2.5:7b" }, { name: "llama3.2:latest" }] })));
    expect(await ollamaModel()).toBe("qwen2.5:7b");
    vi.stubEnv("OLLAMA_MODEL", "llama3.2");
    expect(await ollamaModel()).toBe("llama3.2:latest");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await ollamaModel()).toBeNull();
  });

  it("falls back to Ollama when there is no Anthropic key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [{ name: "llama3.2:latest" }] })));
    expect(await resolveProvider()).toEqual({ kind: "ollama", model: "llama3.2:latest" });
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect((await resolveProvider())?.kind).toBe("anthropic");
  });
});
