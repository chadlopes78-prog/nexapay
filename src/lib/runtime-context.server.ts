type RuntimeContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

// Use a global variable for storage instead of node-only AsyncLocalStorage 
// to be compatible with edge/browser-like runtimes if needed, 
// though here we just need to avoid the build error.
let currentContext: RuntimeContext | null = null;

export function runWithRuntimeContext<T>(ctx: unknown, callback: () => T): T {
  const prev = currentContext;
  currentContext = (ctx ?? {}) as RuntimeContext;
  try {
    return callback();
  } finally {
    currentContext = prev;
  }
}

export function waitUntil(promise: Promise<unknown>) {
  if (typeof currentContext?.waitUntil !== "function") return false;
  currentContext.waitUntil(promise);
  return true;
}
