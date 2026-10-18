import { connection } from "next/server";
import { resolveProvider } from "@/lib/ai/provider";

export async function GET() {
  // evaluate per request so starting Ollama or adding a key doesn't need a rebuild
  await connection();
  const provider = await resolveProvider();
  return Response.json(provider ? { enabled: true, provider: provider.kind, model: provider.model } : { enabled: false });
}
