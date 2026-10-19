/*
 * Bring-your-own-key providers. Each one is called straight from the
 * visitor's browser (all of them allow it), so a key only ever travels to its
 * own provider. The security policy in next.config.ts is built from `origin`
 * below: the page can't send a key anywhere else.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "mistral" | "groq" | "deepseek" | "xai" | "together" | "openrouter";

export interface KeyProvider {
  id: ProviderId;
  label: string;
  /** what you get, in a few words */
  hint: string;
  /** "anthropic" uses the official SDK, "gemini" Google's REST API, "openai" the OpenAI-compatible chat API */
  api: "anthropic" | "gemini" | "openai";
  /** API base URL (OpenAI-compatible and Gemini) */
  base: string;
  /** the only origin this provider's key is ever sent to */
  origin: string;
  keyUrl: string;
  placeholder: string;
  keyPattern: RegExp;
  /** preferred default models, best first; matched against the provider's live model list */
  prefer: RegExp[];
  /** this API supports the json_object response format for structured answers */
  jsonMode?: boolean;
}

export const KEY_PROVIDERS: KeyProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "Claude",
    api: "anthropic",
    base: "https://api.anthropic.com",
    origin: "https://api.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
    keyPattern: /^sk-ant-[\w-]{20,}$/,
    prefer: [/^claude-opus-5-5/, /^claude-sonnet-5-5/, /^claude-opus/, /^claude-sonnet/, /^claude/],
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "GPT",
    api: "openai",
    base: "https://api.openai.com/v1",
    origin: "https://api.openai.com",
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-…",
    keyPattern: /^sk-[\w-]{20,}$/,
    prefer: [/^gpt-5(\.\d+)?$/, /^gpt-5/, /^gpt-4\.1$/, /^gpt-4o$/, /^gpt-/],
    jsonMode: true,
  },
  {
    id: "google",
    label: "Google",
    hint: "Gemini",
    api: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta",
    origin: "https://generativelanguage.googleapis.com",
    keyUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIza…",
    keyPattern: /^AIza[\w-]{30,}$/,
    prefer: [/^gemini-[\d.]+-pro$/, /^gemini-[\d.]+-flash$/, /^gemini-.*pro/, /^gemini/],
  },
  {
    id: "mistral",
    label: "Mistral",
    hint: "Mistral, Codestral",
    api: "openai",
    base: "https://api.mistral.ai/v1",
    origin: "https://api.mistral.ai",
    keyUrl: "https://console.mistral.ai/api-keys",
    placeholder: "your Mistral key",
    keyPattern: /^[\w-]{20,}$/,
    prefer: [/^mistral-large-latest$/, /^codestral-latest$/, /^mistral-medium-latest$/, /-latest$/],
    jsonMode: true,
  },
  {
    id: "groq",
    label: "Groq",
    hint: "very fast open models",
    api: "openai",
    base: "https://api.groq.com/openai/v1",
    origin: "https://api.groq.com",
    keyUrl: "https://console.groq.com/keys",
    placeholder: "gsk_…",
    keyPattern: /^gsk_[\w-]{20,}$/,
    prefer: [/llama-3\.3-70b/, /70b/, /llama/],
    jsonMode: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "DeepSeek chat & reasoner",
    api: "openai",
    base: "https://api.deepseek.com",
    origin: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    placeholder: "sk-…",
    keyPattern: /^sk-[\w-]{20,}$/,
    prefer: [/^deepseek-chat$/, /^deepseek/],
    jsonMode: true,
  },
  {
    id: "xai",
    label: "xAI",
    hint: "Grok",
    api: "openai",
    base: "https://api.x.ai/v1",
    origin: "https://api.x.ai",
    keyUrl: "https://console.x.ai",
    placeholder: "xai-…",
    keyPattern: /^xai-[\w-]{20,}$/,
    prefer: [/^grok-\d+$/, /^grok-\d/, /^grok/],
    jsonMode: true,
  },
  {
    id: "together",
    label: "Together AI",
    hint: "open models: Llama, Qwen, DeepSeek",
    api: "openai",
    base: "https://api.together.xyz/v1",
    origin: "https://api.together.xyz",
    keyUrl: "https://api.together.ai/settings/api-keys",
    placeholder: "your Together key",
    keyPattern: /^[\w-]{20,}$/,
    prefer: [/Llama-3\.3-70B-Instruct/i, /Qwen.*Coder/i, /Llama/i],
    jsonMode: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "one key, hundreds of models",
    api: "openai",
    base: "https://openrouter.ai/api/v1",
    origin: "https://openrouter.ai",
    keyUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-…",
    keyPattern: /^sk-or-[\w-]{20,}$/,
    prefer: [/^anthropic\/claude-(opus|sonnet)/, /^openai\/gpt-5/, /^google\/gemini.*pro/, /^anthropic\//],
    jsonMode: true,
  },
];

export const providerById = (id: ProviderId) => KEY_PROVIDERS.find((p) => p.id === id)!;

/** Chat-capable models only: providers also list embedding, audio, image and moderation models. */
const NOT_CHAT = /(embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|search|guard|rerank|vision-preview|-ocr|aqa)/i;
export const isChatModel = (id: string) => !NOT_CHAT.test(id);

/** The best default from a live model list. */
export function pickModel(provider: KeyProvider, models: string[]): string | undefined {
  for (const re of provider.prefer) {
    const hit = models.filter((m) => re.test(m)).sort((a, b) => b.localeCompare(a))[0];
    if (hit) return hit;
  }
  return models[0];
}
