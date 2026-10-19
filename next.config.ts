import type { NextConfig } from "next";
import { KEY_PROVIDERS } from "./lib/ai/providers";

const dev = process.env.NODE_ENV === "development";

/**
 * Where this page may send data. AI keys and tables can only travel to:
 * this site, the AI providers a visitor can add a key for (each key goes only
 * to its own provider), the visitor's own computer (Ollama), and the hosts
 * the in-browser model downloads from, and Google's sign-in and Firestore
 * endpoints for optional cloud accounts.
 * Scripts and styles aren't restricted here; only outgoing connections are.
 */
const CONNECT_SRC = [
  "'self'",
  ...KEY_PROVIDERS.map((p) => p.origin),
  "http://localhost:*",
  "http://127.0.0.1:*",
  "https://huggingface.co",
  "https://*.huggingface.co",
  "https://*.hf.co",
  "https://raw.githubusercontent.com",
  // Firebase Auth (Google sign-in) and Firestore (cloud sync)
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com",
  ...(dev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
];

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: [`connect-src ${CONNECT_SRC.join(" ")}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join("; ") },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
