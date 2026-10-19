"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { fetchAiStatus, type AiStatus } from "@/lib/store";
import { browserEngine, browserModelCached, browserModelState, ollamaEngine, ownKeyEngine, probeOllama, serverEngine, webGpuAvailable, type Engine } from "./engines";
import { currentApiKey, useAiSettings, useApiKeys, type AiSettings } from "./settings";
import { KEY_PROVIDERS, pickModel, providerById, type ProviderId } from "./providers";
import { DEFAULT_CLAUDE_MODEL } from "./shared";

/** What this browser can reach. Filled in asynchronously; shared by every component. */
export interface AiProbes {
  checked: boolean;
  server: AiStatus | null;
  ollama: string[] | null;
  webgpu: boolean | null;
  /** the chosen in-browser model is already downloaded */
  browserCached: boolean;
}

let probes: AiProbes = { checked: false, server: null, ollama: null, webgpu: null, browserCached: false };
const listeners = new Set<() => void>();
const set = (p: Partial<AiProbes>) => {
  probes = { ...probes, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const SERVER_PROBES: AiProbes = { checked: false, server: null, ollama: null, webgpu: null, browserCached: false };

let inflight: Promise<void> | null = null;
let lastKey = "";
/** Re-check what's reachable (on load, after settings change, or when the visitor asks). */
export function refreshProbes(settings: Pick<AiSettings, "ollamaUrl" | "browserModel">, force = false) {
  const key = `${settings.ollamaUrl}|${settings.browserModel}`;
  if (inflight && key === lastKey && !force) return inflight;
  lastKey = key;
  inflight = Promise.all([
    probes.server && !force ? probes.server : fetchAiStatus(),
    probeOllama(settings.ollamaUrl),
    probes.webgpu ?? webGpuAvailable(),
    browserModelCached(settings.browserModel),
  ]).then(([server, ollama, webgpu, browserCached]) => set({ checked: true, server, ollama, webgpu, browserCached }));
  return inflight;
}

export function useAiProbes() {
  return useSyncExternalStore(subscribe, () => probes, () => SERVER_PROBES);
}

export function useBrowserModelState() {
  return useSyncExternalStore(browserModelState.subscribe, browserModelState.get, browserModelState.get);
}

export interface AiState {
  /** still checking what's available */
  loading: boolean;
  engine: Engine | null;
  probes: AiProbes;
  settings: AiSettings;
}

/** The AI engine to use right now, following the visitor's settings. null = no AI (copy-a-prompt still works). */
export function useAi(): AiState {
  const settings = useAiSettings();
  const keys = useApiKeys();
  const p = useAiProbes();
  const browser = useBrowserModelState();

  useEffect(() => {
    void refreshProbes(settings);
  }, [settings]);

  const engine = useMemo(() => {
    const ownKey = () => {
      // the chosen provider if it has a key; in auto, any provider that does
      const id: ProviderId | undefined = keys[settings.keyProvider]
        ? settings.keyProvider
        : settings.mode === "auto"
          ? KEY_PROVIDERS.find((p) => keys[p.id])?.id
          : undefined;
      return id ? ownKeyEngine(id, currentApiKey, modelFor(settings, id)) : null;
    };
    const server = () => (p.server?.enabled && p.server.model ? serverEngine(p.server.model) : null);
    const ollama = () => {
      if (!p.ollama?.length) return null;
      const model = settings.ollamaModel && p.ollama.includes(settings.ollamaModel) ? settings.ollamaModel : p.ollama[0];
      return ollamaEngine(settings.ollamaUrl, model);
    };
    const inBrowser = () => (p.webgpu ? browserEngine(settings.browserModel) : null);
    switch (settings.mode) {
      case "own-key":
        return ownKey();
      case "server":
        return server();
      case "ollama":
        return ollama();
      case "browser":
        return inBrowser();
      case "off":
        return null;
      default: {
        // auto: never starts a big download on its own, only uses a model that's already there
        const ready = p.browserCached || (browser.status === "ready" && browser.model === settings.browserModel);
        return ownKey() ?? server() ?? ollama() ?? (ready ? inBrowser() : null);
      }
    }
  }, [settings, keys, p, browser.status, browser.model]);

  return { loading: !p.checked, engine, probes: p, settings };
}

/** The model to use with a provider's key: the visitor's pick, else the best one their key can see. */
export function modelFor(settings: AiSettings, id: ProviderId): string {
  const list = settings.modelLists[id] ?? [];
  const chosen = settings.models[id];
  if (chosen && (!list.length || list.includes(chosen))) return chosen;
  return pickModel(providerById(id), list) ?? (id === "anthropic" ? DEFAULT_CLAUDE_MODEL : chosen ?? "");
}

/** Short badge text for the engine in use. */
export function engineBadge(e: Engine): string {
  switch (e.kind) {
    case "own-key":
      return `${e.model} · your ${e.vendor ?? ""} key`.replace("  ", " ");
    case "server":
      return `${e.model} · server`;
    case "ollama":
      return `${e.model} · Ollama · on this computer`;
    case "browser":
      return `${e.model} · in your browser`;
  }
}
