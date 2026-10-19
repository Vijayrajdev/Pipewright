"use client";

import { useSyncExternalStore } from "react";
import type { User } from "firebase/auth";
import { looksLikePii } from "@/lib/rules/pii";
import { getUpdatedAt, onLocalChange, readForSync, writeFromSync, type RecentItem, type SyncName } from "@/lib/store";
import type { Workspace } from "@/lib/workspace/types";
import { cloudConfigured, firebase } from "./firebase";

/*
 * Sign in with Google to keep your work across devices. Firestore layout:
 *   users/{uid}                 profile + plan ("free"; only a server may change it)
 *   users/{uid}/data/{name}     { value: JSON string, updatedAt, bytes } for schema, recent, workspace
 * Values are JSON strings: one write per item, no Firestore type surprises.
 */

export interface AccountUser {
  uid: string;
  name: string;
  email: string;
  photo?: string;
}

export interface AccountState {
  status: "unavailable" | "loading" | "signed-out" | "signed-in";
  user?: AccountUser;
  sync: { enabled: boolean; state: "idle" | "syncing" | "error"; lastSynced?: number; error?: string; skipped?: string };
}

const NAMES: SyncName[] = ["schema", "recent", "workspace"];
/** stay under Firestore's 1 MiB document limit */
const MAX_BYTES = 900_000;

let state: AccountState = { status: cloudConfigured ? "loading" : "unavailable", sync: { enabled: true, state: "idle" } };
const listeners = new Set<() => void>();
const set = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const setSync = (patch: Partial<AccountState["sync"]>) => set({ sync: { ...state.sync, ...patch } });
const SERVER_STATE: AccountState = { status: cloudConfigured ? "loading" : "unavailable", sync: { enabled: true, state: "idle" } };

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => SERVER_STATE,
  );
}

const syncPref = (uid: string) => `pipewright:sync:${uid}`;
const readSyncPref = (uid: string) => {
  try {
    return localStorage.getItem(syncPref(uid)) !== "off";
  } catch {
    return true;
  }
};

// ── what goes up: never rows, and no example values from personal-data columns ──

export function sanitizeWorkspace(ws: Workspace): Workspace {
  return {
    ...ws,
    tables: ws.tables.map((t) => ({
      ...t,
      rows: [],
      keyHashes: undefined,
      stats: t.stats
        ? Object.fromEntries(
            Object.entries(t.stats).map(([col, s]) => {
              const pii = looksLikePii(col) || t.fields.find((f) => f.name === col)?.pii;
              if (!pii) return [col, s];
              // counts stay; the actual values (top, allowed values, min/max) don't
              const safe = { ...s };
              delete safe.top;
              delete safe.enumValues;
              delete safe.min;
              delete safe.max;
              return [col, safe];
            }),
          )
        : undefined,
    })),
  };
}

/** Cloud form of a local value; null when it's too big to sync. */
export function serialize(name: SyncName, value: unknown): string | null {
  if (name !== "workspace") return JSON.stringify(value ?? null);
  let ws = sanitizeWorkspace(value as Workspace);
  let json = JSON.stringify(ws);
  if (json.length > MAX_BYTES) {
    // drop top values and value lists before giving up
    ws = { ...ws, tables: ws.tables.map((t) => ({ ...t, stats: t.stats && Object.fromEntries(Object.entries(t.stats).map(([c, s]) => [c, { ...s, top: undefined, enumValues: undefined }])) })) };
    json = JSON.stringify(ws);
  }
  return json.length > MAX_BYTES ? null : json;
}

/** Recent work from two devices: every item, newest version of each name first. */
export function mergeRecent(a: RecentItem[], b: RecentItem[], max = 6): RecentItem[] {
  const byName = new Map<string, RecentItem>();
  for (const item of [...a, ...b]) {
    const have = byName.get(item.name);
    if (!have || item.savedAt > have.savedAt) byName.set(item.name, item);
  }
  return [...byName.values()].sort((x, y) => y.savedAt.localeCompare(x.savedAt)).slice(0, max);
}

// ── sync ─────────────────────────────────────────────────────────────────

async function dataDoc(name: SyncName) {
  const [{ db }, { doc }] = await Promise.all([firebase(), import("firebase/firestore")]);
  return doc(db, "users", state.user!.uid, "data", name);
}

async function push(name: SyncName): Promise<void> {
  const json = serialize(name, readForSync(name));
  if (json === null) {
    setSync({ skipped: "Your data model is too large to sync. Schemas and recent work still sync." });
    return;
  }
  const { setDoc } = await import("firebase/firestore");
  await setDoc(await dataDoc(name), { value: json, updatedAt: getUpdatedAt(name) || Date.now(), bytes: json.length });
}

async function pullAndReconcile(name: SyncName) {
  const { getDoc } = await import("firebase/firestore");
  const snap = await getDoc(await dataDoc(name));
  const cloud = snap.exists() ? (snap.data() as { value: string; updatedAt: number }) : null;
  const localAt = getUpdatedAt(name);

  if (name === "recent") {
    const local = readForSync("recent") as RecentItem[];
    const merged = mergeRecent(local, cloud ? (JSON.parse(cloud.value) as RecentItem[]) : []);
    const mergedJson = JSON.stringify(merged);
    const now = Math.max(localAt, cloud?.updatedAt ?? 0);
    if (mergedJson !== JSON.stringify(local)) writeFromSync("recent", merged, now);
    if (!cloud || mergedJson !== cloud.value) await push("recent");
    return;
  }
  if (!cloud) {
    if (localAt) await push(name);
  } else if (cloud.updatedAt > localAt) {
    writeFromSync(name, JSON.parse(cloud.value), cloud.updatedAt);
  } else if (localAt > cloud.updatedAt) {
    await push(name);
  }
}

let syncing: Promise<void> | null = null;
/** Bring this browser and the cloud up to date: newer copy wins; recent work is merged. */
export function syncNow(): Promise<void> {
  if (state.status !== "signed-in" || !state.sync.enabled) return Promise.resolve();
  syncing ??= (async () => {
    setSync({ state: "syncing", error: undefined, skipped: undefined });
    try {
      for (const name of NAMES) await pullAndReconcile(name);
      setSync({ state: "idle", lastSynced: Date.now() });
    } catch (e) {
      setSync({ state: "error", error: friendly(e) });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// local edits go up a couple of seconds after the last change
const pending = new Set<SyncName>();
let pushTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePush(name: SyncName) {
  if (state.status !== "signed-in" || !state.sync.enabled) return;
  pending.add(name);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const names = [...pending];
    pending.clear();
    setSync({ state: "syncing" });
    try {
      for (const n of names) await push(n);
      setSync({ state: "idle", lastSynced: Date.now() });
    } catch (e) {
      setSync({ state: "error", error: friendly(e) });
    }
  }, 2000);
}

export function setSyncEnabled(enabled: boolean) {
  if (state.user) {
    try {
      localStorage.setItem(syncPref(state.user.uid), enabled ? "on" : "off");
    } catch {
      /* preference lasts for this page only */
    }
  }
  setSync({ enabled });
  if (enabled) void syncNow();
}

// ── auth ─────────────────────────────────────────────────────────────────

function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Sign-in was cancelled.";
  if (code === "auth/unauthorized-domain") return "This website address isn't authorised for sign-in yet (Firebase → Authentication → Settings → Authorised domains).";
  if (code === "permission-denied") return "The cloud refused this request. Sign out and in again.";
  if (code === "unavailable" || code === "auth/network-request-failed") return "Can't reach the cloud right now. Your work is safe in this browser.";
  return (e as Error)?.message ?? "Something went wrong.";
}

const toUser = (u: User): AccountUser => ({ uid: u.uid, name: u.displayName ?? u.email ?? "You", email: u.email ?? "", photo: u.photoURL ?? undefined });

/** Profile document; the plan starts as "free" and only a trusted server may change it (see firestore.rules). */
async function ensureProfile(u: AccountUser) {
  const [{ db }, { doc, getDoc, setDoc, serverTimestamp }] = await Promise.all([firebase(), import("firebase/firestore")]);
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, { name: u.name, email: u.email, plan: "free", createdAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
  else await setDoc(ref, { name: u.name, email: u.email, lastSeenAt: serverTimestamp() }, { merge: true });
}

let started = false;
/** Start listening for sign-in state. Safe to call many times. */
export function startAccount() {
  if (started || !cloudConfigured) return;
  started = true;
  void (async () => {
    const [{ auth }, { onAuthStateChanged }] = await Promise.all([firebase(), import("firebase/auth")]);
    onAuthStateChanged(auth, async (u) => {
      if (!u) return set({ status: "signed-out", user: undefined, sync: { enabled: true, state: "idle" } });
      const user = toUser(u);
      set({ status: "signed-in", user, sync: { enabled: readSyncPref(user.uid), state: "idle" } });
      try {
        await ensureProfile(user);
        await syncNow();
      } catch (e) {
        setSync({ state: "error", error: friendly(e) });
      }
    });
    onLocalChange(schedulePush);
    // pick up changes made on other devices when coming back to this tab
    let lastFocus = 0;
    window.addEventListener("focus", () => {
      if (Date.now() - lastFocus < 30_000) return;
      lastFocus = Date.now();
      void syncNow();
    });
  })().catch(() => set({ status: "unavailable" }));
}

export async function signInWithGoogle(): Promise<string | null> {
  try {
    const [{ auth }, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([firebase(), import("firebase/auth")]);
    await signInWithPopup(auth, new GoogleAuthProvider());
    return null;
  } catch (e) {
    return friendly(e);
  }
}

/** Sign out. Work stays in this browser; the cloud copy stays in the account. */
export async function signOutAccount() {
  const [{ auth }, { signOut }] = await Promise.all([firebase(), import("firebase/auth")]);
  clearTimeout(pushTimer);
  pending.clear();
  await signOut(auth);
}

/** Delete everything stored in the cloud for this account; optionally the account itself. */
export async function deleteCloudData(alsoAccount: boolean): Promise<string | null> {
  if (!state.user) return null;
  try {
    const [{ db, auth }, { doc, deleteDoc }, { deleteUser, reauthenticateWithPopup, GoogleAuthProvider }] = await Promise.all([
      firebase(),
      import("firebase/firestore"),
      import("firebase/auth"),
    ]);
    const uid = state.user.uid;
    clearTimeout(pushTimer);
    pending.clear();
    for (const name of NAMES) await deleteDoc(doc(db, "users", uid, "data", name));
    await deleteDoc(doc(db, "users", uid));
    if (alsoAccount && auth.currentUser) {
      try {
        await deleteUser(auth.currentUser);
      } catch (e) {
        if ((e as { code?: string }).code !== "auth/requires-recent-login") throw e;
        // Google asks for a fresh sign-in before an account can be deleted
        await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
        await deleteUser(auth.currentUser);
      }
    } else {
      setSyncEnabled(false);
    }
    return null;
  } catch (e) {
    return friendly(e);
  }
}

/** Download everything this account has in the cloud, as JSON. */
export async function exportCloudData(): Promise<string> {
  const { getDoc } = await import("firebase/firestore");
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), account: state.user };
  for (const name of NAMES) {
    const snap = await getDoc(await dataDoc(name));
    out[name] = snap.exists() ? JSON.parse((snap.data() as { value: string }).value) : null;
  }
  return JSON.stringify(out, null, 2);
}
