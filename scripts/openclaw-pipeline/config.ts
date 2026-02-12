/**
 * OpenClaw Pipeline Configuration
 *
 * Centralised knobs for the fetch → bundle → snapshot pipeline.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  /** Working directory for all intermediate artifacts */
  stagingDir: path.resolve(__dirname, '../../.openclaw-staging'),

  /** Final output directory */
  outputDir: path.resolve(__dirname, '../../dist/openclaw'),

  /** npm package to install for the gateway */
  openclawPackage: 'openclaw@latest',

  /** Clawe repo for workspace templates + CLI */
  claweRepo: process.env.CLAWE_REPO ?? 'https://github.com/getclawe/clawe.git',
  claweRepoBranch: process.env.CLAWE_BRANCH ?? 'main',

  /** Native modules that must be stubbed */
  nativeStubs: [
    'sharp',
    'sqlite-vec',
    '@lydell/node-pty',
    'playwright-core',
    'node-edge-tts',
  ] as const,

  /** Modules that are heavy but pure-JS — try to include */
  heavyButUsable: [
    'pdfjs-dist',
  ] as const,

  /** esbuild external patterns — kept out of the gateway bundle */
  bundleExternals: [
    // Native deps we have stubs for
    'sharp',
    'sqlite-vec',
    '@lydell/node-pty',
    'playwright-core',
    'node-edge-tts',
    // Native addons (.node files)
    '@reflink/*',
    '@napi-rs/*',
    '@img/*',
    '@mariozechner/clipboard-*',
    // LLM native bindings
    'node-llama-cpp',
    '@node-llama-cpp/*',
    // Optional / platform-specific
    'fsevents',
    'cpu-features',
    'ssh2',
    'better-sqlite3',
    // Other native
    'canvas',
    'utf-8-validate',
    'bufferutil',
  ] as const,

  /** VFS snapshot filename */
  snapshotFilename: 'openclaw-vfs-snapshot.json',

  /** Agent definitions for workspace setup */
  agents: [
    { id: 'main',  name: 'Clawe', emoji: '🦞', role: 'Squad Lead',       workspace: '/data/workspace',       sessionKey: 'agent:main:main'  },
    { id: 'inky',  name: 'Inky',  emoji: '✍️',  role: 'Content Writer',   workspace: '/data/workspace-inky',  sessionKey: 'agent:inky:main'  },
    { id: 'pixel', name: 'Pixel', emoji: '🎨', role: 'Graphic Designer', workspace: '/data/workspace-pixel', sessionKey: 'agent:pixel:main' },
    { id: 'scout', name: 'Scout', emoji: '🔍', role: 'SEO Specialist',   workspace: '/data/workspace-scout', sessionKey: 'agent:scout:main' },
  ] as const,

  /** Gateway config template (env vars substituted at container spawn time) */
  gatewayConfig: {
    env: { CONVEX_URL: '${CONVEX_URL}' },
    auth: {
      profiles: {
        'anthropic:default': { provider: 'anthropic', mode: 'token' },
      },
    },
    agents: {
      defaults: {
        workspace: '/data/workspace',
        compaction: { mode: 'safeguard' },
        maxConcurrent: 4,
        subagents: { maxConcurrent: 8 },
      },
      list: [
        { id: 'main',  default: true, name: 'Clawe', workspace: '/data/workspace',       identity: { name: 'Clawe', emoji: '🦞' } },
        { id: 'inky',  name: 'Inky',  workspace: '/data/workspace-inky',  model: 'anthropic/claude-sonnet-4-20250514', identity: { name: 'Inky',  emoji: '✍️'  } },
        { id: 'pixel', name: 'Pixel', workspace: '/data/workspace-pixel', model: 'anthropic/claude-sonnet-4-20250514', identity: { name: 'Pixel', emoji: '🎨' } },
        { id: 'scout', name: 'Scout', workspace: '/data/workspace-scout', model: 'anthropic/claude-sonnet-4-20250514', identity: { name: 'Scout', emoji: '🔍' } },
      ],
    },
    tools: {
      agentToAgent: { enabled: true, allow: ['main', 'inky', 'pixel', 'scout'] },
    },
    commands: { native: 'auto', nativeSkills: 'auto' },
    hooks: { internal: { enabled: true, entries: { 'session-memory': { enabled: true } } } },
    gateway: {
      port: 18789,
      mode: 'local',
      bind: 'lan',
      auth: { mode: 'token', token: '${OPENCLAW_TOKEN}' },
      http: { endpoints: { chatCompletions: { enabled: true } } },
    },
  },
} as const;

export type AgentDef = (typeof config.agents)[number];
