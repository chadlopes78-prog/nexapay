import { AsyncLocalStorage } from "node:async_hooks";

type RuntimeContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

const runtimeContextStorage = new AsyncLocalStorage<RuntimeContext>();

export function runWithRuntimeContext<T>(ctx: unknown, callback: () => T): T {
  return runtimeContextStorage.run((ctx ?? {}) as RuntimeContext, callback);
}

export function waitUntil(promise: Promise<unknown>) {
  const ctx = runtimeContextStorage.getStore();
  if (typeof ctx?.waitUntil !== "function") return false;
  ctx.waitUntil(promise);
  return true;
}