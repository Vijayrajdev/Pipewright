/// <reference lib="webworker" />
/**
 * Runs the in-browser model (WebLLM on WebGPU) off the page's main thread,
 * so the page stays responsive while it loads and generates.
 */
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
