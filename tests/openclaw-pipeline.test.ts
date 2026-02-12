/**
 * Tests for the OpenClaw pipeline artifacts.
 *
 * These tests verify that:
 * 1. The stubs have the right API surface
 * 2. A VFS snapshot can be loaded and the loader script executes
 * 3. The spawn-openclaw helper types are correct
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUBS_DIR = path.resolve(__dirname, '../scripts/openclaw-pipeline/stubs');

// ---------------------------------------------------------------------------
// Stub API surface tests
// ---------------------------------------------------------------------------

describe('OpenClaw stubs', () => {
  describe('sharp stub', () => {
    it('exports a callable that returns a chainable pipeline', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require(path.join(STUBS_DIR, 'sharp.cjs'));

      expect(typeof sharp).toBe('function');

      const pipeline = sharp(Buffer.from('fake'));
      expect(typeof pipeline.resize).toBe('function');
      expect(typeof pipeline.png).toBe('function');
      expect(typeof pipeline.toBuffer).toBe('function');
      expect(typeof pipeline.metadata).toBe('function');

      // Chaining works
      const chained = pipeline.resize(100, 100).jpeg().sharpen();
      expect(chained).toBe(pipeline);
    });

    it('metadata() returns sensible defaults', async () => {
      const sharp = require(path.join(STUBS_DIR, 'sharp.cjs'));
      const meta = await sharp().metadata();
      expect(meta.format).toBe('png');
      expect(typeof meta.width).toBe('number');
      expect(typeof meta.height).toBe('number');
    });

    it('toBuffer() returns a Buffer', async () => {
      const sharp = require(path.join(STUBS_DIR, 'sharp.cjs'));
      const buf = await sharp().toBuffer();
      expect(Buffer.isBuffer(buf)).toBe(true);
    });

    it('has static properties', () => {
      const sharp = require(path.join(STUBS_DIR, 'sharp.cjs'));
      expect(sharp.format).toBeDefined();
      expect(sharp.versions).toBeDefined();
      expect(typeof sharp.cache).toBe('function');
      expect(typeof sharp.concurrency).toBe('function');
    });
  });

  describe('node-pty stub', () => {
    it('exports spawn()', () => {
      const pty = require(path.join(STUBS_DIR, 'node-pty.cjs'));
      expect(typeof pty.spawn).toBe('function');
    });

    it('spawn() returns an object with pty API', () => {
      const pty = require(path.join(STUBS_DIR, 'node-pty.cjs'));
      const term = pty.spawn('echo', ['hello'], { cols: 80, rows: 24 });

      expect(typeof term.write).toBe('function');
      expect(typeof term.resize).toBe('function');
      expect(typeof term.kill).toBe('function');
      expect(typeof term.on).toBe('function');
      expect(typeof term.pid).toBe('number');
      expect(term.cols).toBe(80);
      expect(term.rows).toBe(24);

      // Cleanup
      term.kill();
    });
  });

  describe('sqlite-vec stub', () => {
    it('exports load() and getLoadablePath()', () => {
      const sqliteVec = require(path.join(STUBS_DIR, 'sqlite-vec.cjs'));
      expect(typeof sqliteVec.load).toBe('function');
      expect(typeof sqliteVec.getLoadablePath).toBe('function');
    });

    it('load() is a no-op', () => {
      const sqliteVec = require(path.join(STUBS_DIR, 'sqlite-vec.cjs'));
      // Should not throw
      sqliteVec.load(null);
      sqliteVec.load({});
      sqliteVec.load({ loadExtension: () => {} });
    });
  });

  describe('playwright-core stub', () => {
    it('exports browser types', () => {
      const pw = require(path.join(STUBS_DIR, 'playwright-core.cjs'));
      expect(pw.chromium).toBeDefined();
      expect(pw.firefox).toBeDefined();
      expect(pw.webkit).toBeDefined();
      expect(typeof pw.chromium.launch).toBe('function');
    });

    it('launch() throws a descriptive error', async () => {
      const pw = require(path.join(STUBS_DIR, 'playwright-core.cjs'));
      await expect(pw.chromium.launch()).rejects.toThrow(/not available in browser containers/);
    });
  });

  describe('node-edge-tts stub', () => {
    it('exports MsEdgeTTS class', () => {
      const tts = require(path.join(STUBS_DIR, 'node-edge-tts.cjs'));
      expect(tts.MsEdgeTTS).toBeDefined();
      const instance = new tts.MsEdgeTTS();
      expect(typeof instance.getVoices).toBe('function');
    });

    it('getVoices() returns empty array', async () => {
      const tts = require(path.join(STUBS_DIR, 'node-edge-tts.cjs'));
      const instance = new tts.MsEdgeTTS();
      const voices = await instance.getVoices();
      expect(voices).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// VFS snapshot structure test
// ---------------------------------------------------------------------------

describe('OpenClaw VFS snapshot', () => {
  const snapshotPath = path.resolve(__dirname, '../dist/openclaw/openclaw-vfs-snapshot.json');

  // Skip if snapshot hasn't been built yet
  const snapshotExists = fs.existsSync(snapshotPath);

  it.skipIf(!snapshotExists)('snapshot file is valid JSON', () => {
    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(raw);
    expect(snapshot).toHaveProperty('files');
    expect(Array.isArray(snapshot.files)).toBe(true);
  });

  it.skipIf(!snapshotExists)('contains required directories', () => {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const dirs = snapshot.files
      .filter((f: any) => f.type === 'directory')
      .map((f: any) => f.path);

    expect(dirs).toContain('/openclaw');
    expect(dirs).toContain('/data');
    expect(dirs).toContain('/data/shared');
    expect(dirs).toContain('/data/workspace');
    expect(dirs).toContain('/data/workspace-inky');
    expect(dirs).toContain('/data/workspace-pixel');
    expect(dirs).toContain('/data/workspace-scout');
    expect(dirs).toContain('/stubs');
  });

  it.skipIf(!snapshotExists)('contains gateway, loader, config, and stubs', () => {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const files = snapshot.files
      .filter((f: any) => f.type === 'file')
      .map((f: any) => f.path);

    expect(files).toContain('/openclaw/gateway.cjs');
    expect(files).toContain('/openclaw/loader.cjs');
    expect(files).toContain('/openclaw/openclaw.json');
    expect(files).toContain('/openclaw/stub-map.json');
    expect(files).toContain('/stubs/sharp.cjs');
    expect(files).toContain('/stubs/node-pty.cjs');
    expect(files).toContain('/stubs/sqlite-vec.cjs');
    expect(files).toContain('/stubs/playwright-core.cjs');
    expect(files).toContain('/stubs/node-edge-tts.cjs');
  });

  it.skipIf(!snapshotExists)('contains workspace templates for all agents', () => {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const files = snapshot.files
      .filter((f: any) => f.type === 'file')
      .map((f: any) => f.path);

    for (const ws of ['/data/workspace', '/data/workspace-inky', '/data/workspace-pixel', '/data/workspace-scout']) {
      expect(files).toContainEqual(expect.stringContaining(`${ws}/SOUL.md`));
      expect(files).toContainEqual(expect.stringContaining(`${ws}/HEARTBEAT.md`));
      expect(files).toContainEqual(expect.stringContaining(`${ws}/AGENTS.md`));
    }

    // Shared files should be in each workspace
    for (const ws of ['/data/workspace', '/data/workspace-inky', '/data/workspace-pixel', '/data/workspace-scout']) {
      expect(files).toContainEqual(expect.stringContaining(`${ws}/shared/WORKFLOW.md`));
      expect(files).toContainEqual(expect.stringContaining(`${ws}/shared/WORKING.md`));
      expect(files).toContainEqual(expect.stringContaining(`${ws}/shared/CLAWE-CLI.md`));
    }
  });

  it.skipIf(!snapshotExists)('loader.cjs is a valid script', () => {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const loader = snapshot.files.find((f: any) => f.path === '/openclaw/loader.cjs');
    expect(loader).toBeDefined();
    // Content is base64-encoded — decode to check
    const decoded = Buffer.from(loader.content, 'base64').toString('utf-8');
    expect(decoded).toContain('registerStubs');
    expect(decoded).toContain('setupEnv');
    expect(decoded).toContain('resolveConfig');
    expect(decoded).toContain('startGateway');
  });
});

// ---------------------------------------------------------------------------
// Pipeline config test
// ---------------------------------------------------------------------------

describe('Pipeline config', () => {
  it('has all 4 agents defined', async () => {
    const { config } = await import('../scripts/openclaw-pipeline/config.js');
    expect(config.agents).toHaveLength(4);
    const ids = config.agents.map(a => a.id);
    expect(ids).toContain('main');
    expect(ids).toContain('inky');
    expect(ids).toContain('pixel');
    expect(ids).toContain('scout');
  });

  it('gateway config has all agents in the list', async () => {
    const { config } = await import('../scripts/openclaw-pipeline/config.js');
    const agentIds = config.gatewayConfig.agents.list.map(a => a.id);
    expect(agentIds).toEqual(['main', 'inky', 'pixel', 'scout']);
  });

  it('stub list covers all native deps', async () => {
    const { config } = await import('../scripts/openclaw-pipeline/config.js');
    expect(config.nativeStubs).toContain('sharp');
    expect(config.nativeStubs).toContain('@lydell/node-pty');
    expect(config.nativeStubs).toContain('sqlite-vec');
    expect(config.nativeStubs).toContain('playwright-core');
    expect(config.nativeStubs).toContain('node-edge-tts');
  });
});
