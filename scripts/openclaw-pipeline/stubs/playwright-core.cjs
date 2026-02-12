/**
 * playwright-core stub for almostnode containers
 *
 * OpenClaw uses Playwright for web browsing skills.
 * In browser containers, real browser automation isn't possible.
 * This stub lets the module load and provides informative errors
 * if a skill actually tries to launch a browser.
 */
'use strict';

const STUB_ERROR = 'playwright-core is not available in browser containers. ' +
  'Web browsing skills are disabled in this environment.';

class StubBrowser {
  async newContext() { throw new Error(STUB_ERROR); }
  async newPage()    { throw new Error(STUB_ERROR); }
  async close()      {}
  isConnected()      { return false; }
}

class StubBrowserType {
  constructor(name) { this._name = name; }
  name()           { return this._name; }
  async launch()   { throw new Error(STUB_ERROR); }
  async connect()  { throw new Error(STUB_ERROR); }
  async launchPersistentContext() { throw new Error(STUB_ERROR); }
  async launchServer()           { throw new Error(STUB_ERROR); }
  executablePath() { return ''; }
}

const chromium = new StubBrowserType('chromium');
const firefox  = new StubBrowserType('firefox');
const webkit   = new StubBrowserType('webkit');

const devices = {};

// playwright-core/lib/server/... internal imports are harder to stub,
// but the top-level API is what OpenClaw gateway touches.
module.exports = {
  chromium,
  firefox,
  webkit,
  devices,
  errors: {
    TimeoutError: class TimeoutError extends Error { constructor(m) { super(m); this.name = 'TimeoutError'; } },
  },
  selectors: { register() {} },
  _electron: { launch() { throw new Error(STUB_ERROR); } },
  _android:  { devices() { throw new Error(STUB_ERROR); } },
};
module.exports.default = module.exports;
