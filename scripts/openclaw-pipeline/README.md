# OpenClaw → almostnode Pipeline

Automated pipeline to package OpenClaw for execution inside almostnode browser containers.

## What It Does

1. **Fetches** the `openclaw` npm package (+ `@clawe/cli` source)
2. **Bundles** the gateway into a single CJS file with native deps stubbed
3. **Collects** all Clawe workspace templates (SOUL.md, HEARTBEAT.md, etc.)
4. **Builds** a complete VFS snapshot that `AgentContainerManager.spawn()` can load instantly
5. **Outputs** `dist/openclaw-vfs-snapshot.json` — a ready-to-go container filesystem

## Usage

```bash
# Full pipeline — fetch, bundle, snapshot
node --import tsx scripts/openclaw-pipeline/build.ts

# Just rebuild snapshot from existing staging
node --import tsx scripts/openclaw-pipeline/build.ts --snapshot-only

# Custom Clawe repo (if you have a fork)
CLAWE_REPO=https://github.com/yourfork/clawe.git \
  node --import tsx scripts/openclaw-pipeline/build.ts
```

## Loading in Browser

```typescript
import { AgentContainerManager } from 'almostnode';

// Load the pre-built snapshot
const snapshot = await fetch('/openclaw-vfs-snapshot.json').then(r => r.json());

const manager = new AgentContainerManager({
  maxContainers: 5,
  runtime: { dangerouslyAllowSameOrigin: true },
});

const container = await manager.spawn({
  vfsSnapshot: snapshot,
  cwd: '/openclaw',
  env: {
    ANTHROPIC_API_KEY: 'sk-ant-...',
    OPENCLAW_TOKEN: 'my-token',
    CONVEX_URL: 'https://your-deployment.convex.cloud',
    OPENCLAW_PORT: '18789',
  },
});

// Start the gateway
await manager.execute(container.id, `require('/openclaw/gateway.cjs');`);
```

## Output Structure

The VFS snapshot contains:

```
/openclaw/
  gateway.cjs              ← Bundled OpenClaw gateway (native deps stubbed)
  openclaw.json            ← Gateway config
/clawe/
  cli.cjs                  ← Bundled Clawe CLI
/data/
  shared/
    WORKING.md
    WORKFLOW.md
    CLAWE-CLI.md
  workspace/               ← Clawe (lead)
    SOUL.md, HEARTBEAT.md, AGENTS.md, TOOLS.md, USER.md, MEMORY.md
    shared/ → (files copied, no symlinks in VFS)
  workspace-inky/           ← Inky (writer)
  workspace-pixel/          ← Pixel (designer)
  workspace-scout/          ← Scout (SEO)
/stubs/
  sharp.cjs                ← Stub: image processing
  sqlite-vec.cjs           ← Stub: vector DB
  node-pty.cjs             ← Stub: PTY (routes to just-bash)
  playwright-core.cjs      ← Stub: browser automation
  node-edge-tts.cjs        ← Stub: TTS
```
