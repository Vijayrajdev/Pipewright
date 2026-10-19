"use client";

import { useEffect, useState, type ReactNode } from "react";
import { KEY_PROVIDERS, pickModel, providerById } from "@/lib/ai/providers";
import {
  BROWSER_MODELS,
  DEFAULT_OLLAMA_URL,
  forgetApiKey,
  isLocalUrl,
  looksLikeKey,
  maskKey,
  OPEN_AI_SETTINGS,
  saveApiKey,
  updateAiSettings,
  useApiKeys,
  type AiMode,
} from "@/lib/ai/settings";
import { deleteBrowserModel, loadBrowserModel, verifyKey } from "@/lib/ai/engines";
import { engineBadge, modelFor, refreshProbes, useAi, useBrowserModelState } from "@/lib/ai/useAi";
import { Button } from "./ui";

const field = "w-full border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none";

function Option({ mode, current, title, tag, children, disabled }: { mode: AiMode; current: AiMode; title: string; tag: string; children: ReactNode; disabled?: boolean }) {
  const on = mode === current;
  return (
    <section className={`border transition-colors duration-300 ${on ? "border-ink bg-ink-soft/30" : "border-line"} ${disabled ? "opacity-60" : ""}`}>
      <label className="flex cursor-pointer items-center gap-3 p-4">
        <input type="radio" name="ai-mode" className="accent-coral" checked={on} disabled={disabled} onChange={() => updateAiSettings({ mode })} />
        <span className="font-wide flex-1 text-sm font-black text-ink uppercase">{title}</span>
        <span className="label border border-line bg-paper px-2 py-0.5 text-coral-deep">{tag}</span>
      </label>
      <div className="space-y-3 px-4 pb-4 pl-11 text-sm">{children}</div>
    </section>
  );
}

const Safe = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-2">
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="mt-0.5 shrink-0 text-ink">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span>{children}</span>
  </li>
);

function OwnKey() {
  const keys = useApiKeys();
  const { settings } = useAi();
  const provider = providerById(settings.keyProvider);
  const saved = keys[provider.id];
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [state, setState] = useState<{ busy?: boolean; error?: string; ok?: string }>({});
  const models = settings.modelLists[provider.id] ?? [];

  async function check() {
    const k = draft.trim();
    if (!looksLikeKey(provider.id, k)) return setState({ error: `That doesn't look like a ${provider.label} key${provider.placeholder.endsWith("…") ? ` (they start with ${provider.placeholder.slice(0, -1)})` : ""}.` });
    setState({ busy: true });
    const result = await verifyKey(provider.id, k);
    if (!result.ok) return setState({ error: result.message });
    saveApiKey(provider.id, k, remember);
    updateAiSettings({
      mode: "own-key",
      modelLists: { ...settings.modelLists, [provider.id]: result.models },
      models: { ...settings.models, [provider.id]: settings.models[provider.id] ?? pickModel(provider, result.models) },
    });
    setDraft("");
    setState({ ok: `Key works. ${result.models.length} models available.` });
  }

  return (
    <>
      {/* provider picker */}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="AI provider">
        {KEY_PROVIDERS.map((p) => {
          const on = p.id === provider.id;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={on}
              onClick={() => {
                updateAiSettings({ keyProvider: p.id });
                setDraft("");
                setState({});
              }}
              title={p.hint}
              className={`label flex items-center gap-1.5 border px-2.5 py-1.5 transition-colors ${on ? "border-ink bg-ink text-ivory" : "border-line text-ink hover:border-ink"}`}
            >
              {keys[p.id] && <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-coral" : "bg-ink"}`} aria-label="key saved" />}
              {p.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        {provider.label}: {provider.hint}.{" "}
        <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="text-ink underline">
          Get a {provider.label} key →
        </a>
      </p>

      {saved ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-ink">{maskKey(saved.key)}</span>
          <span className="label text-muted">{saved.remembered ? "remembered on this device" : "this tab only"}</span>
          <button onClick={() => (forgetApiKey(provider.id), setState({}))} className="label link-grow ml-auto text-coral-deep">
            Forget key
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
          className="space-y-2"
        >
          <div className="flex gap-2">
            <input
              type={show ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={provider.placeholder}
              autoComplete="off"
              spellCheck={false}
              aria-label={`${provider.label} API key`}
              className={field}
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="label border border-line px-2 text-muted hover:text-ink">
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" className="accent-coral" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember on this device (leave off on shared computers)
          </label>
          <Button type="submit" disabled={!draft.trim() || state.busy}>
            {state.busy ? "Checking…" : "Check & save key"}
          </Button>
        </form>
      )}
      {state.error && <p className="text-xs text-coral-deep">{state.error}</p>}
      {state.ok && <p className="text-xs text-ink">{state.ok}</p>}

      {saved && models.length > 0 && (
        <label className="block text-xs text-muted">
          Model
          <select
            value={modelFor(settings, provider.id)}
            onChange={(e) => updateAiSettings({ models: { ...settings.models, [provider.id]: e.target.value } })}
            className={`${field} mt-1`}
          >
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}

      <ul className="space-y-1.5 border-l-2 border-ink/30 pl-3 text-xs text-muted">
        <Safe>Sent only to <b className="text-text">{provider.origin.replace("https://", "")}</b>, straight from this browser.</Safe>
        <Safe>Never sent to Pipewright&apos;s server, and never put in links or logs.</Safe>
        <Safe>Kept for this tab only unless you choose to remember it. Each provider&apos;s key is stored separately.</Safe>
        <Safe>Tip: make a separate key with a monthly spend limit, and delete it whenever you like.</Safe>
      </ul>
    </>
  );
}

function InBrowser() {
  const { settings, probes } = useAi();
  const model = useBrowserModelState();
  const loading = model.status === "loading";
  const ready = model.status === "ready" && model.model === settings.browserModel;
  if (probes.webgpu === false) {
    return (
      <p className="text-xs text-muted">
        This browser doesn&apos;t support WebGPU, which in-browser models need. Try a recent Chrome or Edge on a desktop, or use Ollama below.
      </p>
    );
  }
  return (
    <>
      <ul className="space-y-1.5 text-xs text-muted">
        <Safe>No key and no account. The model runs on your own graphics chip.</Safe>
        <Safe>Your questions and tables never leave this device.</Safe>
        <Safe>Downloaded once, then cached by your browser. Smaller than the cloud models, so answers are simpler.</Safe>
      </ul>
      <select value={settings.browserModel} onChange={(e) => updateAiSettings({ browserModel: e.target.value })} disabled={loading} className={field} aria-label="In-browser model">
        {BROWSER_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} · {m.size} · {m.hint}
          </option>
        ))}
      </select>
      {loading ? (
        <div>
          <div className="h-1.5 overflow-hidden bg-line/60">
            <div className="h-full bg-coral transition-[width] duration-300" style={{ width: `${Math.round(model.progress * 100)}%` }} />
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-muted">{model.text}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={ready ? "ghost" : "primary"}
            disabled={ready}
            onClick={() => {
              updateAiSettings({ mode: "browser" });
              void loadBrowserModel(settings.browserModel).then(() => refreshProbes(settings, true)).catch(() => {});
            }}
          >
            {ready ? "Running" : probes.browserCached ? "Start model" : "Download & start"}
          </Button>
          {(probes.browserCached || ready) && (
            <button
              onClick={() => void deleteBrowserModel(settings.browserModel).then(() => refreshProbes(settings, true))}
              className="label link-grow text-muted hover:text-coral-deep"
            >
              Delete download
            </button>
          )}
        </div>
      )}
      {model.status === "error" && <p className="text-xs text-coral-deep">{model.text} Try the smallest model.</p>}
    </>
  );
}

function Ollama() {
  const { settings, probes } = useAi();
  const [url, setUrl] = useState(settings.ollamaUrl);
  const valid = isLocalUrl(url);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const hosted = origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin);
  return (
    <>
      <p className="text-xs text-muted">
        Free models running in <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-ink underline">Ollama</a> on your own computer.
        Pipewright talks to it directly from this page, so nothing passes through a server.
      </p>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_OLLAMA_URL} className={field} aria-label="Ollama address" />
        <Button
          variant="ghost"
          disabled={!valid}
          onClick={() => {
            updateAiSettings({ ollamaUrl: url.replace(/\/$/, "") });
            void refreshProbes({ ...settings, ollamaUrl: url.replace(/\/$/, "") }, true);
          }}
        >
          Check
        </Button>
      </div>
      {!valid && <p className="text-xs text-coral-deep">For safety, only your own computer is allowed: http://localhost:… or http://127.0.0.1:…</p>}
      {probes.ollama ? (
        probes.ollama.length ? (
          <select value={settings.ollamaModel ?? probes.ollama[0]} onChange={(e) => updateAiSettings({ ollamaModel: e.target.value })} className={field} aria-label="Ollama model">
            {probes.ollama.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted">Connected, but no models yet. Run <code className="font-mono text-ink">ollama pull llama3.2</code>.</p>
        )
      ) : (
        <div className="text-xs text-muted">
          <p>Not reachable yet. Install Ollama, run <code className="font-mono text-ink">ollama pull llama3.2</code>, then click Check.</p>
          {hosted && (
            <p className="mt-1">
              Because this site isn&apos;t on your computer, start Ollama so it accepts this page:{" "}
              <code className="font-mono break-all text-ink">OLLAMA_ORIGINS=&quot;{origin}&quot; ollama serve</code>
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function AiSettingsDialog() {
  const [open, setOpen] = useState(false);
  const { settings, probes, engine } = useAi();

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(OPEN_AI_SETTINGS, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_AI_SETTINGS, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!open) return null;
  const mode = settings.mode;

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto px-4 py-[6vh]" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
      <button aria-label="Close AI settings" className="fixed inset-0 animate-fade-in bg-night/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="paper relative w-full max-w-2xl animate-pop border border-line shadow-2xl">
        <header className="paper-blue flex items-start justify-between gap-4 p-6">
          <div>
            <p className="label text-cream/70">AI settings</p>
            <h2 id="ai-settings-title" className="font-wide mt-1 text-2xl font-black text-cream uppercase">
              How should AI run?
            </h2>
            <p className="mt-2 text-sm text-cream/80">
              Only the chat and ✨ descriptions use AI. Every other tool works without it.
              {engine && <> Right now: <b className="text-coral">{engineBadge(engine)}</b>.</>}
            </p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cream/30 text-cream transition-transform duration-300 hover:rotate-90">
            ×
          </button>
        </header>

        <div className="space-y-3 p-4 md:p-6">
          <Option mode="auto" current={mode} title="Automatic" tag="recommended">
            <p className="text-xs text-muted">Uses a key you&apos;ve added (any provider), then this site&apos;s AI, then Ollama, then an in-browser model you&apos;ve already downloaded.</p>
          </Option>
          <Option mode="own-key" current={mode} title="Your own API key" tag="Claude · GPT · Gemini · more">
            <OwnKey />
          </Option>
          <Option mode="browser" current={mode} title="In-browser model" tag="no key · private">
            <InBrowser />
          </Option>
          <Option mode="ollama" current={mode} title="Ollama on your computer" tag="no key · free">
            <Ollama />
          </Option>
          {probes.server?.enabled && (
            <Option mode="server" current={mode} title="This site's AI" tag="provided">
              <p className="text-xs text-muted">
                {probes.server.model}, set up by whoever runs this Pipewright. Your question and the table&apos;s columns go through their server.
              </p>
            </Option>
          )}
          <Option mode="off" current={mode} title="No AI, copy a prompt" tag="nothing shared">
            <p className="text-xs text-muted">
              Pipewright writes a ready-made prompt with your table&apos;s context. Paste it into any AI chat you already use (Claude, ChatGPT, Gemini,
              Copilot) and, for descriptions, paste the answer back.
            </p>
          </Option>
        </div>
      </div>
    </div>
  );
}
