/**
 * Sentry SDK shim for browser-based runtime
 * Provides no-op implementations since error tracking to Sentry isn't useful in our environment
 */

// No-op functions
const noop = () => {};
const noopPromise = () => Promise.resolve();

// Scope class (no-op)
class Scope {
  setTag = noop;
  setTags = noop;
  setUser = noop;
  setContext = noop;
  setExtra = noop;
  setExtras = noop;
  setLevel = noop;
  setTransactionName = noop;
  setFingerprint = noop;
  addBreadcrumb = noop;
  clearBreadcrumbs = noop;
  addEventProcessor = noop;
  addAttachment = noop;
  clear = noop;
  update = () => this;
  clone = () => new Scope();
}

// Hub class (no-op)
class Hub {
  getClient = () => undefined;
  getScope = () => new Scope();
  pushScope = () => new Scope();
  popScope = noop;
  withScope = (callback: (scope: Scope) => void) => callback(new Scope());
  captureException = () => '';
  captureMessage = () => '';
  captureEvent = () => '';
  addBreadcrumb = noop;
  setUser = noop;
  setTags = noop;
  setTag = noop;
  setExtra = noop;
  setExtras = noop;
  setContext = noop;
}

// Transaction (no-op)
class Transaction {
  name = '';
  spanId = '';
  traceId = '';
  op = '';
  finish = noop;
  setTag = noop;
  setData = noop;
  setStatus = noop;
  startChild = () => new Transaction();
  toTraceparent = () => '';
}

// Current hub singleton
const currentHub = new Hub();

// Main exports
export const init = noop;
export const close = noopPromise;
export const flush = noopPromise;
export const captureException = () => '';
export const captureMessage = () => '';
export const captureEvent = () => '';
export const addBreadcrumb = noop;
export const setUser = noop;
export const setTag = noop;
export const setTags = noop;
export const setExtra = noop;
export const setExtras = noop;
export const setContext = noop;
export const configureScope = (callback: (scope: Scope) => void) => callback(new Scope());
export const withScope = (callback: (scope: Scope) => void) => callback(new Scope());
export const getCurrentHub = () => currentHub;
export const getHubFromCarrier = () => currentHub;
export const startTransaction = () => new Transaction();
export const lastEventId = () => undefined;

// Classes
export { Scope, Hub };

// Integrations (no-op)
export const Integrations = {
  Http: class {},
  OnUncaughtException: class {},
  OnUnhandledRejection: class {},
  Console: class {},
  Context: class {},
  ContextLines: class {},
  Modules: class {},
  RequestData: class {},
  LinkedErrors: class {},
};

// Node-specific exports
export const Handlers = {
  requestHandler: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  errorHandler: () => (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next(),
  tracingHandler: () => (_req: unknown, _res: unknown, next: () => void) => next(),
};

export default {
  init,
  close,
  flush,
  captureException,
  captureMessage,
  captureEvent,
  addBreadcrumb,
  setUser,
  setTag,
  setTags,
  setExtra,
  setExtras,
  setContext,
  configureScope,
  withScope,
  getCurrentHub,
  startTransaction,
  lastEventId,
  Scope,
  Hub,
  Integrations,
  Handlers,
};
