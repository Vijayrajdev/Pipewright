"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_CLAUDE_MODEL } from "./shared";
import { KEY_PROVIDERS, providerById, type ProviderId } from "./providers";

/*
 * How AI runs for this visitor. Everything here lives in the visitor's own
 * browser. API keys (one per provider) in particular:
 *  - are kept in sessionStorage (gone when the tab closes) unless they tick
 *    "remember on this device", which uses localStorage;
 *  - are only ever sent to their own provider, straight from the browser.
 *    They never go to Pipewright's server, into URLs or into logs.
 */

/** `auto` picks the best available route in this order: own key → host's server → Ollama → in-browser model. */
export type AiMode = "auto" | "own-key" | "server" | "ollama" | "browser" | "off";

export interface AiSettings {
  mode: AiMode;
  /** which saved key "own-key" uses */
  keyProvider: ProviderId;
  /** chosen model per provider */
  models: Partial<Record<ProviderId, string>>;
  /** each provider's chat models, fetched when its key was checked (not secret) */
  modelLists: Partial<Record<ProviderId, string[]>>;
  ollamaUrl: string;
  ollamaModel?: string;
  browserModel: string;
}

export const BROWSER_MODELS = [
  { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 Coder 1.5B", size: "≈1 GB download", hint: "good at SQL, runs on most laptops" },
  { id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 Coder 3B", size: "≈2 GB download", hint: "better answers, needs a stronger GPU" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", size: "≈0.7 GB download", hint: "smallest, for low-memory machines" },
] as const;

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

const DEFAULTS: AiSettings = {
  mode: "auto",
  keyProvider: "anthropic",
  models: { anthropic: DEFAULT_CLAUDE_MODEL },
  modelLists: {},
  ollamaUrl: DEFAULT_OLLAMA_URL,
  browserModel: BROWSER_MODELS[0].id,
};

const SETTINGS_KEY = "pipewright:ai";
const keySlot = (id: ProviderId) => `pipewright:key:${id}`;
/** where the first version kept an Anthropic key */
const LEGACY_KEY = "pipewright:anthropic-key";

/** Ollama is only reachable on the visitor's own machine (the security policy enforces this too). */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export const looksLikeKey = (id: ProviderId, k: string) => providerById(id).keyPattern.test(k.trim());
export const maskKey = (k: string) => `${k.slice(0, 10)}…${k.slice(-4)}`;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let settingsCache: AiSettings | null = null;
function readSettings(): AiSettings {
  if (!settingsCache) {
    const saved = safe(() => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AiSettings> | null, null);
    settingsCache = { ...DEFAULTS, ...saved };
    if (!KEY_PROVIDERS.some((p) => p.id === settingsCache!.keyProvider)) settingsCache.keyProvider = "anthropic";
    // the first version kept one Claude model
    const legacy = (saved as { claudeModel?: string } | null)?.claudeModel;
    if (legacy && !saved?.models) settingsCache.models = { anthropic: legacy };
    if (!isLocalUrl(settingsCache.ollamaUrl)) settingsCache.ollamaUrl = DEFAULT_OLLAMA_URL;
  }
  return settingsCache;
}

export function updateAiSettings(patch: Partial<AiSettings>) {
  settingsCache = { ...readSettings(), ...patch };
  safe(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)), undefined);
  emit();
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(subscribe, readSettings, () => DEFAULTS);
}

// ── API keys, one per provider ──────────────────────────────────────────

export interface SavedKey {
  key: string;
  remembered: boolean;
}
type Keys = Partial<Record<ProviderId, SavedKey>>;

let keysCache: Keys | undefined;
function readKeys(): Keys {
  if (keysCache === undefined) {
    // move a key saved by the first version into its provider slot
    for (const store of [() => sessionStorage, () => localStorage]) {
      const old = safe(() => store().getItem(LEGACY_KEY), null);
      if (old) {
        safe(() => store().setItem(keySlot("anthropic"), old), undefined);
        safe(() => store().removeItem(LEGACY_KEY), undefined);
      }
    }
    const keys: Keys = {};
    for (const p of KEY_PROVIDERS) {
      const session = safe(() => sessionStorage.getItem(keySlot(p.id)), null);
      const local = safe(() => localStorage.getItem(keySlot(p.id)), null);
      if (session) keys[p.id] = { key: session, remembered: false };
      else if (local) keys[p.id] = { key: local, remembered: true };
    }
    keysCache = keys;
  }
  return keysCache;
}

export function saveApiKey(id: ProviderId, key: string, remember: boolean) {
  const k = key.trim();
  // only one copy, in the place the visitor chose
  safe(() => sessionStorage.removeItem(keySlot(id)), undefined);
  safe(() => localStorage.removeItem(keySlot(id)), undefined);
  safe(() => (remember ? localStorage : sessionStorage).setItem(keySlot(id), k), undefined);
  keysCache = { ...readKeys(), [id]: { key: k, remembered: remember } };
  emit();
}

export function forgetApiKey(id: ProviderId) {
  safe(() => sessionStorage.removeItem(keySlot(id)), undefined);
  safe(() => localStorage.removeItem(keySlot(id)), undefined);
  const next = { ...readKeys() };
  delete next[id];
  keysCache = next;
  emit();
}

const NO_KEYS: Keys = {};
export function useApiKeys(): Keys {
  return useSyncExternalStore(subscribe, readKeys, () => NO_KEYS);
}

/** Read a key at call time (never held in React state or props). */
export const currentApiKey = (id: ProviderId) => readKeys()[id]?.key ?? null;

// other tabs: a key or settings change there shows up here
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    const isKey = !!e.key?.startsWith("pipewright:key:");
    if (e.key === SETTINGS_KEY) settingsCache = null;
    if (isKey) keysCache = undefined;
    if (e.key === SETTINGS_KEY || isKey) emit();
  });
}

/** Open the AI settings dialog from anywhere. */
export const OPEN_AI_SETTINGS = "pipewright:ai-settings";
export const openAiSettings = () => window.dispatchEvent(new Event(OPEN_AI_SETTINGS));
