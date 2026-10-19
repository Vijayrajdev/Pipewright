"use client";

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

/*
 * Optional cloud account: Google sign-in (Firebase Auth) and sync (Firestore).
 * Without these settings the app is local-only, exactly as before.
 * The Firebase web config is public by design: it only names the project.
 * What protects data is firestore.rules (each user can reach only their own
 * documents) and the list of authorised domains in Firebase Auth.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const cloudConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

let services: Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> | null = null;

/** Firebase loads only when a visitor uses an account feature, so local-only visitors never download it. */
export function firebase() {
  if (!cloudConfigured) return Promise.reject(new Error("Cloud accounts aren't set up on this Pipewright."));
  services ??= (async () => {
    const [{ initializeApp, getApps }, { getAuth }, { getFirestore }] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
    const app = getApps()[0] ?? initializeApp(config);
    return { app, auth: getAuth(app), db: getFirestore(app) };
  })();
  return services;
}
