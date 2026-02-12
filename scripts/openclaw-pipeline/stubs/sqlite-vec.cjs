/**
 * sqlite-vec stub for almostnode containers
 *
 * Provides the load() entry point that OpenClaw calls to register
 * the vec0 virtual-table extension. Since there's no real SQLite
 * in the browser, this is a no-op that lets the gateway start.
 *
 * Vector search operations will gracefully fail with "not available"
 * rather than crashing.
 */
'use strict';

/**
 * Load the extension into a database handle.
 * Real sqlite-vec calls db.loadExtension(); we just skip it.
 */
function load(db) {
  // no-op — the extension isn't available in browser containers
  if (db && typeof db.loadExtension === 'function') {
    // Don't actually call it — there's no .node binary to load
  }
}

/**
 * Get the path to the loadable extension file.
 * Returns a placeholder so consumers don't crash on path resolution.
 */
function getLoadablePath() {
  return '/stubs/sqlite-vec-stub.node';
}

module.exports = { load, getLoadablePath };
module.exports.load = load;
module.exports.getLoadablePath = getLoadablePath;
module.exports.default = { load, getLoadablePath };
