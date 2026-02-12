#!/usr/bin/env node
/**
 * OpenClaw → almostnode Pipeline
 *
 * Fetches, bundles, stubs, and snapshots OpenClaw + Clawe into a single
 * VFS snapshot file that AgentContainerManager can load instantly.
 *
 * Usage:
 *   node --import tsx scripts/openclaw-pipeline/build.ts
 *   node --import tsx scripts/openclaw-pipeline/build.ts --snapshot-only
 *   node --import tsx scripts/openclaw-pipeline/build.ts --skip-fetch
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUBS_DIR = path.join(__dirname, 'stubs');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const snapshotOnly = args.includes('--snapshot-only');
const skipFetch = args.includes('--skip-fetch');
const verbose = args.includes('--verbose') || args.includes('-v');

function log(msg: string) { console.log(`  ${msg}`); }
function step(msg: string) { console.log(`\n→ ${msg}`); }

// ---------------------------------------------------------------------------
// Types for the VFS snapshot (matches almostnode's VFSSnapshot)
// ---------------------------------------------------------------------------
interface VFSFileEntry {
  path: string;
  type: 'file' | 'directory';
  content?: string; // base64 for binary, raw utf-8 text otherwise
}

interface VFSSnapshot {
  files: VFSFileEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, cwd?: string): string {
  if (verbose) log(`$ ${cmd}`);
  return execSync(cmd, {
    cwd: cwd ?? process.cwd(),
    encoding: 'utf-8',
    stdio: verbose ? 'inherit' : 'pipe',
    timeout: 300_000, // 5 min
  }) as unknown as string;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function isTextFile(filePath: string): boolean {
  const textExts = new Set([
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
    '.json', '.md', '.txt', '.yml', '.yaml', '.toml',
    '.css', '.html', '.svg', '.sh', '.bash', '.env',
    '.map', '.d.ts', '.lock', '.log', '.gitignore',
  ]);
  const ext = path.extname(filePath).toLowerCase();
  if (textExts.has(ext)) return true;
  // No extension — check if it's likely text
  if (!ext) {
    const base = path.basename(filePath).toUpperCase();
    return ['LICENSE', 'README', 'CHANGELOG', 'MAKEFILE', 'DOCKERFILE'].includes(base);
  }
  return false;
}

function fileToVFSEntry(diskPath: string, vfsPath: string): VFSFileEntry {
  const content = fs.readFileSync(diskPath);
  // VirtualFS.fromSnapshot() always base64-decodes, so we must always base64-encode.
  // Use the same encoding that VirtualFS.toSnapshot() uses: btoa(String.fromCharCode(...bytes))
  return { path: vfsPath, type: 'file', content: Buffer.from(content).toString('base64') };
}

/**
 * Recursively walk a directory, yielding { diskPath, relativePath } for each file.
 */
function* walkDir(dir: string, base: string = ''): Generator<{ diskPath: string; rel: string }> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const diskPath = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkDir(diskPath, rel);
    } else if (entry.isFile()) {
      yield { diskPath, rel };
    }
  }
}

// ===========================================================================
// PHASE 1 — Fetch
// ===========================================================================

async function phaseFetch() {
  step('Phase 1: Fetch OpenClaw + Clawe');

  ensureDir(config.stagingDir);
  const npmDir = path.join(config.stagingDir, 'npm-install');
  const claweDir = path.join(config.stagingDir, 'clawe-repo');

  // 1a. Install openclaw into a temp directory so we get the full module tree
  if (!skipFetch) {
    log('Installing openclaw from npm (this takes a minute)...');
    ensureDir(npmDir);

    // Create a minimal package.json so npm install works
    fs.writeFileSync(path.join(npmDir, 'package.json'), JSON.stringify({
      name: 'openclaw-staging',
      version: '0.0.0',
      private: true,
      dependencies: { openclaw: 'latest' },
    }, null, 2));

    run('npm install --ignore-scripts --no-audit --no-fund 2>&1 || true', npmDir);
    log('✓ openclaw installed');

    // 1b. Clone the Clawe repo (shallow) for templates + CLI source
    if (fs.existsSync(claweDir)) {
      log('Updating clawe repo...');
      run(`git -C "${claweDir}" pull --ff-only 2>&1 || true`);
    } else {
      log('Cloning clawe repo (shallow)...');
      run(`git clone --depth 1 --branch ${config.claweRepoBranch} ${config.claweRepo} "${claweDir}" 2>&1`);
    }
    log('✓ clawe repo ready');
  } else {
    log('Skipping fetch (--skip-fetch)');
    if (!fs.existsSync(npmDir)) throw new Error(`Staging dir not found: ${npmDir}. Run without --skip-fetch first.`);
  }

  return { npmDir, claweDir };
}

// ===========================================================================
// PHASE 2 — Bundle
// ===========================================================================

async function phaseBundle(npmDir: string, claweDir: string) {
  step('Phase 2: Bundle gateway + CLI');

  const bundleDir = path.join(config.stagingDir, 'bundle');
  ensureDir(bundleDir);

  // 2a. Build a stub-aware esbuild config and bundle the gateway
  log('Bundling OpenClaw gateway...');

  const gatewayEntry = path.join(npmDir, 'node_modules/openclaw/dist/index.js');
  const gatewayOut = path.join(bundleDir, 'gateway.cjs');

  if (!fs.existsSync(gatewayEntry)) {
    // Try the CLI entry instead
    const cliEntry = path.join(npmDir, 'node_modules/openclaw/openclaw.mjs');
    if (!fs.existsSync(cliEntry)) {
      throw new Error(`Cannot find openclaw entry point. Looked at:\n  ${gatewayEntry}\n  ${cliEntry}`);
    }
    log(`Using CLI entry: openclaw.mjs`);
    bundleWithEsbuild(cliEntry, gatewayOut, npmDir);
  } else {
    bundleWithEsbuild(gatewayEntry, gatewayOut, npmDir);
  }
  log(`✓ Gateway bundled → ${path.relative(config.stagingDir, gatewayOut)} (${fmtSize(gatewayOut)})`);

  // 2b. Bundle the Clawe CLI
  let cliOut: string | null = null;
  const cliDist = path.join(claweDir, 'packages/cli/dist/clawe.js');
  const cliOutMjs = path.join(bundleDir, 'clawe-cli.mjs');
  const cliOutCjs = path.join(bundleDir, 'clawe-cli.cjs');

  if (fs.existsSync(cliDist)) {
    // Pre-built dist exists — just copy
    fs.copyFileSync(cliDist, cliOutMjs);
    cliOut = cliOutMjs;
    log(`✓ Clawe CLI copied → ${path.relative(config.stagingDir, cliOut)} (${fmtSize(cliOut)})`);
  } else {
    // Build from source using our workspace-aware bundler
    const cliEntry = path.join(claweDir, 'packages/cli/src/index.ts');
    if (fs.existsSync(cliEntry)) {
      log('Building Clawe CLI from source...');
      const bundlerScript = path.join(__dirname, 'bundle-cli.mjs');
      run(`node "${bundlerScript}" "${claweDir}" "${cliOutMjs}"`);
      cliOut = cliOutMjs;
      log(`✓ Clawe CLI bundled → ${path.relative(config.stagingDir, cliOut)} (${fmtSize(cliOut)})`);
    } else {
      log('⚠ Clawe CLI source not found — skipping');
    }
  }

  // Create CJS wrapper for the CLI too
  if (cliOut) {
    fs.writeFileSync(cliOutCjs, `'use strict';\nmodule.exports = import('/clawe/cli.mjs');\n`);
  }

  return { gatewayOut, cliOut, bundleDir };
}

function bundleWithEsbuild(entry: string, outfile: string, npmDir: string) {
  // Use the esbuild JS API for more control (handles top-level await, .node files, etc.)
  const esbuildBin = path.resolve(__dirname, '../../node_modules/.bin/esbuild');

  // Build externals args
  const externals = config.bundleExternals.map(e => `--external:${e}`).join(' ');

  // We use ESM output format to support top-level await, then wrap in a CJS shim.
  // Alternatively, we can use --format=esm and rename to .mjs.
  // For almostnode container compatibility (CJS runtime), we bundle as ESM first
  // then do a second pass to convert.
  //
  // Strategy: bundle as ESM (supports TLA), output as .mjs, then create
  // a CJS wrapper that uses dynamic import().

  const esmOut = outfile.replace('.cjs', '.mjs');

  const cmd = [
    esbuildBin,
    JSON.stringify(entry),
    `--bundle`,
    `--format=esm`,
    `--platform=node`,
    `--target=node22`,
    `--outfile=${JSON.stringify(esmOut)}`,
    externals,
    `--loader:.node=empty`,         // Skip .node binary files
    `--define:import.meta.dirname='"/openclaw"'`,
    `--define:import.meta.filename='"/openclaw/gateway.cjs"'`,
    `--log-level=warning`,
    `--log-limit=0`,
    `--tree-shaking=true`,
    // Minify to reduce snapshot size (~32MB → ~12MB, gzips to ~4MB)
    `--minify`,
  ].join(' ');

  run(cmd, npmDir);

  // Create CJS wrapper that re-exports the ESM bundle
  // The almostnode runtime's ESM→CJS transform will handle this,
  // or we provide both formats.
  const wrapperCode = `/**
 * OpenClaw Gateway — CJS entry point
 * Auto-generated by the openclaw-pipeline.
 *
 * This wraps the ESM bundle for compatibility with the almostnode CJS runtime.
 * The ESM source is at /openclaw/gateway.mjs
 */
'use strict';

// For CJS environments: use dynamic import to load the ESM bundle
module.exports = import('/openclaw/gateway.mjs');
`;
  fs.writeFileSync(outfile, wrapperCode);
  log(`  ESM bundle: ${fmtSize(esmOut)} → CJS wrapper: ${fmtSize(outfile)}`);
}

function fmtSize(filePath: string): string {
  const bytes = fs.statSync(filePath).size;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ===========================================================================
// PHASE 3 — Collect workspace templates
// ===========================================================================

async function phaseCollectTemplates(claweDir: string) {
  step('Phase 3: Collect workspace templates');

  const templates: Map<string, string> = new Map();
  const templatesDir = path.join(claweDir, 'docker/openclaw/templates');

  if (!fs.existsSync(templatesDir)) {
    log('⚠ Templates directory not found in clawe repo — using embedded defaults');
    return templates;
  }

  // Walk the templates directory
  for (const { diskPath, rel } of walkDir(templatesDir)) {
    const content = fs.readFileSync(diskPath, 'utf-8');
    templates.set(rel, content);
    if (verbose) log(`  collected: ${rel}`);
  }

  log(`✓ Collected ${templates.size} template files`);
  return templates;
}

// ===========================================================================
// PHASE 4 — Build VFS snapshot
// ===========================================================================

async function phaseSnapshot(
  gatewayOut: string,
  cliOut: string | null,
  templates: Map<string, string>,
) {
  step('Phase 4: Build VFS snapshot');

  const entries: VFSFileEntry[] = [];

  // Helper to add a text file (base64-encoded for VirtualFS.fromSnapshot() compatibility)
  const addText = (vfsPath: string, content: string) => {
    entries.push({ path: vfsPath, type: 'file', content: Buffer.from(content, 'utf-8').toString('base64') });
  };

  // Helper to add a directory marker
  const addDir = (vfsPath: string) => {
    entries.push({ path: vfsPath, type: 'directory' });
  };

  // --- Directories ---
  for (const d of [
    '/openclaw', '/clawe', '/stubs',
    '/data', '/data/shared',
    '/data/workspace', '/data/workspace/memory',
    '/data/workspace-inky', '/data/workspace-inky/memory',
    '/data/workspace-pixel', '/data/workspace-pixel/memory', '/data/workspace-pixel/assets',
    '/data/workspace-scout', '/data/workspace-scout/memory', '/data/workspace-scout/research',
  ]) {
    addDir(d);
  }

  // --- Gateway bundle ---
  if (fs.existsSync(gatewayOut)) {
    entries.push(fileToVFSEntry(gatewayOut, '/openclaw/gateway.cjs'));
    log(`  + /openclaw/gateway.cjs (${fmtSize(gatewayOut)})`);

    // Also include the ESM bundle (the CJS wrapper imports it)
    const esmPath = gatewayOut.replace('.cjs', '.mjs');
    if (fs.existsSync(esmPath)) {
      entries.push(fileToVFSEntry(esmPath, '/openclaw/gateway.mjs'));
      log(`  + /openclaw/gateway.mjs (${fmtSize(esmPath)})`);
    }
  }

  // --- Gateway config ---
  addText('/openclaw/openclaw.json', JSON.stringify(config.gatewayConfig, null, 2));
  log('  + /openclaw/openclaw.json');

  // --- Clawe CLI bundle ---
  if (cliOut && fs.existsSync(cliOut)) {
    entries.push(fileToVFSEntry(cliOut, '/clawe/cli.mjs'));
    log(`  + /clawe/cli.mjs (${fmtSize(cliOut)})`);

    // CJS wrapper
    const cliCjsPath = cliOut.replace('.mjs', '.cjs');
    if (fs.existsSync(cliCjsPath)) {
      entries.push(fileToVFSEntry(cliCjsPath, '/clawe/cli.cjs'));
      log(`  + /clawe/cli.cjs`);
    }
  }

  // --- Native module stubs ---
  const stubFiles = fs.readdirSync(STUBS_DIR).filter(f => f.endsWith('.cjs'));
  for (const stub of stubFiles) {
    const diskPath = path.join(STUBS_DIR, stub);
    entries.push(fileToVFSEntry(diskPath, `/stubs/${stub}`));
    log(`  + /stubs/${stub}`);
  }

  // --- Workspace templates ---
  // Shared files go into /data/shared/
  // Agent-specific files go into /data/workspace-{agent}/
  for (const [rel, content] of templates) {
    let vfsPath: string;

    if (rel.startsWith('shared/')) {
      vfsPath = `/data/${rel}`;
    } else if (rel.startsWith('workspaces/clawe/')) {
      vfsPath = `/data/workspace/${rel.replace('workspaces/clawe/', '')}`;
    } else if (rel.startsWith('workspaces/inky/')) {
      vfsPath = `/data/workspace-inky/${rel.replace('workspaces/inky/', '')}`;
    } else if (rel.startsWith('workspaces/pixel/')) {
      vfsPath = `/data/workspace-pixel/${rel.replace('workspaces/pixel/', '')}`;
    } else if (rel.startsWith('workspaces/scout/')) {
      vfsPath = `/data/workspace-scout/${rel.replace('workspaces/scout/', '')}`;
    } else if (rel === 'config.template.json') {
      // Already handled above with the config object
      continue;
    } else {
      vfsPath = `/data/templates/${rel}`;
    }

    addText(vfsPath, content);
    if (verbose) log(`  + ${vfsPath}`);
  }

  // Copy shared files into each agent workspace (VFS doesn't support symlinks)
  const sharedFiles = [...templates.entries()].filter(([rel]) => rel.startsWith('shared/'));
  const agentWorkspaces = ['/data/workspace', '/data/workspace-inky', '/data/workspace-pixel', '/data/workspace-scout'];
  for (const ws of agentWorkspaces) {
    for (const [rel, content] of sharedFiles) {
      const filename = rel.replace('shared/', '');
      addText(`${ws}/shared/${filename}`, content);
    }
  }
  log(`  + shared/ files copied into ${agentWorkspaces.length} agent workspaces`);

  // --- Bootstrap loader script ---
  addText('/openclaw/loader.cjs', generateLoaderScript());
  log('  + /openclaw/loader.cjs (bootstrap script)');

  // --- Module resolution map (tells the runtime where stubs live) ---
  addText('/openclaw/stub-map.json', JSON.stringify({
    'sharp': '/stubs/sharp.cjs',
    'sqlite-vec': '/stubs/sqlite-vec.cjs',
    '@lydell/node-pty': '/stubs/node-pty.cjs',
    'playwright-core': '/stubs/playwright-core.cjs',
    'node-edge-tts': '/stubs/node-edge-tts.cjs',
  }, null, 2));
  log('  + /openclaw/stub-map.json');

  // --- Write the snapshot ---
  const snapshot: VFSSnapshot = { files: entries };
  ensureDir(config.outputDir);
  const outPath = path.join(config.outputDir, config.snapshotFilename);
  fs.writeFileSync(outPath, JSON.stringify(snapshot));

  const outSize = fmtSize(outPath);
  log(`\n✓ Snapshot written → ${path.relative(process.cwd(), outPath)} (${outSize})`);
  log(`  ${entries.length} entries (${entries.filter(e => e.type === 'file').length} files, ${entries.filter(e => e.type === 'directory').length} directories)`);

  return outPath;
}

// ---------------------------------------------------------------------------
// Loader script — executed first when the container starts
// ---------------------------------------------------------------------------

function generateLoaderScript(): string {
  return `/**
 * OpenClaw Container Loader
 *
 * Run this first in a container to wire up stubs and env before
 * starting the gateway.
 *
 * Usage:
 *   const loader = require('/openclaw/loader.cjs');
 *   loader.setup();              // wire stubs + env
 *   loader.startGateway();       // launch the gateway
 */
'use strict';

const path = require('path');
const fs = require('fs');

// Stub map: module name → VFS path
const STUB_MAP = JSON.parse(fs.readFileSync('/openclaw/stub-map.json', 'utf-8'));

/**
 * Register module stubs so that require('sharp') etc.
 * resolve to our stub files instead of missing native modules.
 */
function registerStubs() {
  // Patch Module._resolveFilename if available (almostnode runtime)
  const Module = require('module');
  if (Module._resolveFilename) {
    const original = Module._resolveFilename;
    Module._resolveFilename = function(request, parent, isMain, options) {
      if (STUB_MAP[request]) {
        return STUB_MAP[request];
      }
      return original.call(this, request, parent, isMain, options);
    };
  }
}

/**
 * Ensure environment variables are set from the container's env.
 */
function setupEnv() {
  const defaults = {
    OPENCLAW_STATE_DIR: '/openclaw',
    OPENCLAW_PORT: '18789',
    NODE_ENV: 'production',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

/**
 * Substitute env vars into the gateway config.
 */
function resolveConfig() {
  let configStr = fs.readFileSync('/openclaw/openclaw.json', 'utf-8');
  // Replace \${VAR_NAME} patterns with env values
  configStr = configStr.replace(/\\$\\{(\\w+)\\}/g, (_, name) => process.env[name] || '');
  const config = JSON.parse(configStr);
  fs.writeFileSync('/openclaw/openclaw.json', JSON.stringify(config, null, 2));
  return config;
}

/**
 * Full setup — call once before starting the gateway.
 */
function setup() {
  registerStubs();
  setupEnv();
  return resolveConfig();
}

/**
 * Start the OpenClaw gateway.
 */
function startGateway() {
  require('/openclaw/gateway.cjs');
}

module.exports = { setup, startGateway, registerStubs, setupEnv, resolveConfig, STUB_MAP };
`;
}

// ===========================================================================
// PHASE 5 — Generate consumer helpers
// ===========================================================================

async function phaseConsumerHelpers(snapshotPath: string) {
  step('Phase 5: Generate consumer helpers');

  // Write a TypeScript module that provides typed helpers
  const helperPath = path.join(config.outputDir, 'spawn-openclaw.ts');
  const snapshotFilename = config.snapshotFilename;

  fs.writeFileSync(helperPath, `/**
 * OpenClaw Container Helpers — auto-generated by the pipeline
 *
 * Usage:
 *   import { spawnOpenClaw } from './spawn-openclaw';
 *   const { manager, containers } = await spawnOpenClaw({
 *     anthropicApiKey: 'sk-ant-...',
 *     openclawToken: 'my-token',
 *     convexUrl: 'https://your-deployment.convex.cloud',
 *   });
 */

import type {
  AgentContainerManager,
  AgentContainerManagerOptions,
  AgentContainerInfo,
  VFSSnapshot,
} from '../../src/index';

export interface SpawnOpenClawOptions {
  /** Anthropic API key for Claude */
  anthropicApiKey: string;
  /** Auth token for the OpenClaw gateway */
  openclawToken: string;
  /** Convex deployment URL */
  convexUrl: string;
  /** Optional OpenAI API key (for image generation) */
  openaiApiKey?: string;
  /** Override manager options */
  managerOptions?: Partial<AgentContainerManagerOptions>;
  /** Custom snapshot (default: fetches from same origin) */
  snapshot?: VFSSnapshot;
  /** Base URL to fetch the snapshot from */
  snapshotUrl?: string;
}

export interface SpawnOpenClawResult {
  manager: AgentContainerManager;
  gateway: AgentContainerInfo;
  agents: {
    clawe: AgentContainerInfo;
    inky: AgentContainerInfo;
    pixel: AgentContainerInfo;
    scout: AgentContainerInfo;
  };
}

/**
 * Fetch the pre-built VFS snapshot.
 */
export async function loadSnapshot(url?: string): Promise<VFSSnapshot> {
  const fetchUrl = url ?? '/${snapshotFilename}';
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(\`Failed to fetch OpenClaw snapshot: \${res.status} \${res.statusText}\`);
  return res.json();
}

/**
 * Spawn a complete OpenClaw instance inside almostnode containers.
 *
 * Creates:
 *  - 1 gateway container (runs the OpenClaw gateway process)
 *  - 4 agent workspace containers (clawe, inky, pixel, scout)
 */
export async function spawnOpenClaw(
  options: SpawnOpenClawOptions,
): Promise<SpawnOpenClawResult> {
  // Dynamic import so this file can be used in both Node and browser
  const { AgentContainerManager } = await import('../../src/index');

  const snapshot = options.snapshot ?? await loadSnapshot(options.snapshotUrl);

  const manager = new AgentContainerManager({
    maxContainers: 10,
    defaultExecutionTimeoutMs: 120_000,
    runtime: { dangerouslyAllowSameOrigin: true, useWorker: 'auto' },
    ...options.managerOptions,
  });

  const env = {
    ANTHROPIC_API_KEY: options.anthropicApiKey,
    OPENCLAW_TOKEN: options.openclawToken,
    CONVEX_URL: options.convexUrl,
    OPENAI_API_KEY: options.openaiApiKey ?? '',
    OPENCLAW_PORT: '18789',
    OPENCLAW_STATE_DIR: '/openclaw',
    NODE_ENV: 'production',
  };

  // Spawn the gateway container with the full snapshot
  const gateway = await manager.spawn({
    id: 'openclaw-gateway',
    vfsSnapshot: snapshot,
    cwd: '/openclaw',
    env,
  });

  // Bootstrap: register stubs + resolve config
  await manager.execute(gateway.id, \`
    const loader = require('/openclaw/loader.cjs');
    loader.setup();
  \`);

  // Spawn individual agent workspace containers
  // Each gets the same snapshot but a different cwd
  const spawnAgent = async (id: string, workspace: string) => {
    const agent = await manager.spawn({
      id: \`agent-\${id}\`,
      vfsSnapshot: snapshot,
      cwd: workspace,
      env: { ...env, AGENT_ID: id, WORKSPACE: workspace },
    });
    // Register stubs in agent container too
    await manager.execute(agent.id, \`
      const loader = require('/openclaw/loader.cjs');
      loader.registerStubs();
      loader.setupEnv();
    \`);
    return agent;
  };

  const [clawe, inky, pixel, scout] = await Promise.all([
    spawnAgent('main',  '/data/workspace'),
    spawnAgent('inky',  '/data/workspace-inky'),
    spawnAgent('pixel', '/data/workspace-pixel'),
    spawnAgent('scout', '/data/workspace-scout'),
  ]);

  return {
    manager,
    gateway,
    agents: { clawe, inky, pixel, scout },
  };
}
`);

  log(`✓ Consumer helper → ${path.relative(process.cwd(), helperPath)}`);
}

// ===========================================================================
// Main
// ===========================================================================

async function main() {
  console.log('🦞 OpenClaw → almostnode Pipeline\n');
  const start = Date.now();

  if (snapshotOnly) {
    // Rebuild snapshot from existing staging data
    step('Snapshot-only mode');
    const gatewayOut = path.join(config.stagingDir, 'bundle/gateway.cjs');
    const cliOut = path.join(config.stagingDir, 'bundle/clawe-cli.cjs');
    const claweDir = path.join(config.stagingDir, 'clawe-repo');

    if (!fs.existsSync(gatewayOut)) {
      throw new Error(`No gateway bundle found at ${gatewayOut}. Run full pipeline first.`);
    }

    const templates = await phaseCollectTemplates(claweDir);
    const snapshotPath = await phaseSnapshot(
      gatewayOut,
      fs.existsSync(cliOut) ? cliOut : null,
      templates,
    );
    await phaseConsumerHelpers(snapshotPath);
  } else {
    // Full pipeline
    const { npmDir, claweDir } = await phaseFetch();
    const { gatewayOut, cliOut } = await phaseBundle(npmDir, claweDir);
    const templates = await phaseCollectTemplates(claweDir);
    const snapshotPath = await phaseSnapshot(gatewayOut, cliOut, templates);
    await phaseConsumerHelpers(snapshotPath);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Pipeline complete in ${elapsed}s`);
  console.log(`   Output: ${path.relative(process.cwd(), config.outputDir)}/`);
}

main().catch((err) => {
  console.error('\n❌ Pipeline failed:', err.message);
  if (verbose && err.stack) console.error(err.stack);
  process.exit(1);
});
