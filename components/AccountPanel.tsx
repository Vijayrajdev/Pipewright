"use client";

import { useState } from "react";
import { deleteCloudData, exportCloudData, setSyncEnabled, signInWithGoogle, signOutAccount, syncNow, useAccount } from "@/lib/cloud/account";
import { Avatar, GoogleG, syncLabel, useNow } from "./AccountMenu";
import { Button, Card, Notice, RuleLabel } from "./ui";

const SYNCED = ["The table you have open in the Schema Builder", "Recent work", "Your data model: tables, columns, keys, relationships, profile numbers and diagram layout"];
const NOT_SYNCED = ["The rows of your files (they stay in this browser)", "Example values from personal-data columns such as emails or phone numbers", "Your AI keys"];

function Lists() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <RuleLabel className="mb-3">Saved to your account</RuleLabel>
        <ul className="space-y-2 text-sm">
          {SYNCED.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-ink">✓</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <RuleLabel className="mb-3">Never leaves your browser</RuleLabel>
        <ul className="space-y-2 text-sm">
          {NOT_SYNCED.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-coral-deep">✕</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AccountPanel() {
  const account = useAccount();
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"data" | "account" | null>(null);
  const [busy, setBusy] = useState(false);

  if (account.status === "unavailable") {
    return (
      <Card>
        <p className="text-sm text-muted">
          Accounts aren&apos;t switched on for this copy of Pipewright. Everything you do is saved in this browser, free, with no sign-in.
        </p>
      </Card>
    );
  }
  if (account.status === "loading") return <Card><p className="text-sm text-muted">Checking your account…</p></Card>;

  if (account.status === "signed-out") {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="label text-muted">Without an account</p>
            <h2 className="font-wide mt-2 text-2xl font-black text-ink uppercase">Local · free</h2>
            <p className="mt-3 text-sm text-muted">Every tool, with your work saved in this browser on this device. Nothing to sign up for. This is what you have now.</p>
          </Card>
          <div className="paper-blue p-6">
            <p className="label text-cream/70">With a Google sign-in</p>
            <h2 className="font-wide mt-2 text-2xl font-black text-cream uppercase">Cloud sync</h2>
            <p className="mt-3 text-sm text-cream/85">
              Your schemas, recent work and data models follow you to any device and survive clearing your browser. Free during early access.
            </p>
            <button
              onClick={async () => setError(await signInWithGoogle())}
              className="mt-5 flex items-center gap-3 rounded-full bg-cream px-5 py-2.5 text-sm font-semibold text-night transition-transform duration-300 hover:scale-[1.03]"
            >
              <GoogleG size={18} /> Sign in with Google
            </button>
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Card>
          <Lists />
        </Card>
      </div>
    );
  }

  const user = account.user!;
  const sync = account.sync;

  async function download() {
    const json = await exportCloudData();
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipewright-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(alsoAccount: boolean) {
    setBusy(true);
    const message = await deleteCloudData(alsoAccount);
    setBusy(false);
    setConfirm(null);
    setError(message);
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar user={user} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-wide text-xl font-black text-ink uppercase">{user.name}</p>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
          <div className="text-right">
            <p className="label text-muted">Plan</p>
            <p className="font-semibold text-ink">Free · early access</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">Cloud sync is free during early access. If a paid plan is introduced, you&apos;ll be told well before anything is charged.</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-wide text-lg font-black text-ink uppercase">Cloud sync</p>
            <p className={`text-sm ${sync.state === "error" ? "text-coral-deep" : "text-muted"}`}>{now ? syncLabel(sync, now) : ""}</p>
            {sync.skipped && <p className="text-xs text-coral-deep">{sync.skipped}</p>}
          </div>
          <div className="flex items-center gap-3">
            {sync.enabled && (
              <Button variant="ghost" onClick={() => void syncNow()} disabled={sync.state === "syncing"}>
                Sync now
              </Button>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <span className="text-muted">{sync.enabled ? "On" : "Off"}</span>
              <button
                role="switch"
                aria-checked={sync.enabled}
                aria-label="Cloud sync"
                onClick={() => setSyncEnabled(!sync.enabled)}
                className={`relative h-6 w-11 rounded-full transition-colors duration-300 ${sync.enabled ? "bg-ink" : "bg-line"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-ivory shadow transition-transform duration-300 ease-spring ${sync.enabled ? "translate-x-5" : ""}`} />
              </button>
            </label>
          </div>
        </div>
        <div className="mt-6 border-t border-line pt-6">
          <Lists />
        </div>
      </Card>

      <Card>
        <p className="font-wide mb-4 text-lg font-black text-ink uppercase">Your data</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void download()}>
            Download everything (JSON)
          </Button>
          <Button variant="ghost" onClick={() => void signOutAccount()}>
            Sign out
          </Button>
          <Button variant="ghost" onClick={() => setConfirm("data")}>
            Delete my cloud data
          </Button>
          <Button variant="ghost" onClick={() => setConfirm("account")}>
            Delete my account
          </Button>
        </div>
        {confirm && (
          <div className="mt-4 animate-fade-in border border-coral bg-coral-soft/40 p-4 text-sm">
            <p className="font-semibold text-coral-deep">
              {confirm === "data"
                ? "Delete everything Pipewright stores for you in the cloud? Sync will be switched off. Your work in this browser stays."
                : "Delete your cloud data and your Pipewright account? Google may ask you to confirm it's you. Your work in this browser stays."}
            </p>
            <div className="mt-3 flex gap-3">
              <Button onClick={() => void remove(confirm === "account")} disabled={busy}>
                {busy ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </Card>
    </div>
  );
}
