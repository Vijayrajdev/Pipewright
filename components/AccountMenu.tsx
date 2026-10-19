"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { signInWithGoogle, signOutAccount, startAccount, syncNow, useAccount, type AccountState } from "@/lib/cloud/account";

// a clock for "synced 2 min ago": ticks every 30 s while something shows it
let now = 0;
let clock: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();
function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!clock) {
    now = Date.now();
    clock = setInterval(() => {
      now = Date.now();
      clockListeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(cb);
    if (!clockListeners.size) {
      clearInterval(clock);
      clock = undefined;
    }
  };
}
/** Current time, refreshed every 30 s; 0 during server rendering. */
export function useNow() {
  return useSyncExternalStore(subscribeClock, () => now, () => 0);
}

/** The Google "G", in its own colours. */
export function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Avatar({ user, size = 32 }: { user: NonNullable<AccountState["user"]>; size?: number }) {
  return user.photo ? (
    // Google profile photos are plain external images; no-referrer keeps them loading reliably
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.photo} alt="" width={size} height={size} referrerPolicy="no-referrer" className="rounded-full" />
  ) : (
    <span className="font-wide grid place-items-center rounded-full bg-coral text-xs font-black text-night" style={{ width: size, height: size }}>
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function syncLabel(sync: AccountState["sync"], now: number): string {
  if (!sync.enabled) return "Cloud sync off";
  if (sync.state === "syncing") return "Syncing…";
  if (sync.state === "error") return sync.error ?? "Sync failed";
  if (!sync.lastSynced) return "Ready to sync";
  const mins = Math.max(0, Math.round((now - sync.lastSynced) / 60_000));
  return mins < 1 ? "Synced just now" : `Synced ${mins} min ago`;
}

export function AccountMenu() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const now = useNow();

  useEffect(() => startAccount(), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (account.status === "unavailable") return null;
  if (account.status === "loading") return <span className="h-10 w-10 animate-pulse rounded-full border border-line" aria-hidden="true" />;

  if (account.status === "signed-out") {
    return (
      <div className="relative">
        <button
          onClick={async () => setError(await signInWithGoogle())}
          title="Optional: sign in to keep your work across devices"
          className="group flex h-10 items-center gap-2 rounded-full border border-line bg-paper px-3 text-sm font-semibold text-ink transition-all duration-500 ease-out-expo hover:border-ink hover:shadow-md"
        >
          <span className="transition-transform duration-500 ease-spring group-hover:rotate-[-12deg]">
            <GoogleG />
          </span>
          <span className="hidden sm:inline">Sign in</span>
        </button>
        {error && (
          <p role="alert" className="paper absolute top-12 right-0 z-50 w-64 animate-pop border border-coral p-3 text-xs text-coral-deep shadow-lg">
            {error}
          </p>
        )}
      </div>
    );
  }

  const user = account.user!;
  const sync = account.sync;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-line transition-all duration-300 hover:border-coral"
      >
        <Avatar user={user} size={30} />
        <span
          className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-ivory ${
            !sync.enabled ? "bg-line" : sync.state === "error" ? "bg-coral-deep" : sync.state === "syncing" ? "animate-pulse bg-coral" : "bg-ink"
          }`}
        />
      </button>
      {open && (
        <div className="paper absolute top-12 right-0 z-50 w-72 animate-pop border border-line shadow-xl">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <Avatar user={user} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
          <div className="space-y-1 p-2">
            <p className={`px-2 py-1.5 text-xs ${sync.state === "error" ? "text-coral-deep" : "text-muted"}`}>{now ? syncLabel(sync, now) : ""}</p>
            {sync.enabled && (
              <button onClick={() => void syncNow()} className="block w-full px-2 py-1.5 text-left text-sm text-ink hover:bg-ink-soft/50">
                Sync now
              </button>
            )}
            <Link href="/account" onClick={() => setOpen(false)} className="block px-2 py-1.5 text-sm text-ink hover:bg-ink-soft/50">
              Account &amp; your data
            </Link>
            <button onClick={() => (setOpen(false), void signOutAccount())} className="block w-full px-2 py-1.5 text-left text-sm text-coral-deep hover:bg-coral-soft/40">
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
