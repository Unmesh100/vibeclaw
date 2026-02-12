/**
 * Bundle the Clawe CLI from source using esbuild.
 *
 * Handles workspace package resolution (@clawe/backend, @clawe/shared)
 * that esbuild's --alias flag can't do (subpath exports).
 *
 * Called from build.ts when the pre-built CLI dist isn't available.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const [claweDir, outfile] = process.argv.slice(2);
if (!claweDir || !outfile) {
  console.error('Usage: node bundle-cli.mjs <claweDir> <outfile>');
  process.exit(1);
}

const workspacePlugin = {
  name: 'clawe-workspace',
  setup(build) {
    // @clawe/backend → convex/_generated/api.js
    build.onResolve({ filter: /^@clawe\/backend$/ }, () => ({
      path: path.join(claweDir, 'packages/backend/convex/_generated/api.js'),
    }));
    build.onResolve({ filter: /^@clawe\/backend\/(.+)/ }, (args) => {
      const sub = args.path.replace('@clawe/backend/', '');
      return { path: path.join(claweDir, `packages/backend/convex/_generated/${sub}.js`) };
    });

    // @clawe/shared/agents → src/agents/index.ts
    build.onResolve({ filter: /^@clawe\/shared\/(.+)/ }, (args) => {
      const sub = args.path.replace('@clawe/shared/', '');
      const tsPath = path.join(claweDir, `packages/shared/src/${sub}/index.ts`);
      if (fs.existsSync(tsPath)) return { path: tsPath };
      // Fallback: maybe it's a single file
      const tsFile = path.join(claweDir, `packages/shared/src/${sub}.ts`);
      if (fs.existsSync(tsFile)) return { path: tsFile };
      return null;
    });
    build.onResolve({ filter: /^@clawe\/shared$/ }, () => {
      const idx = path.join(claweDir, 'packages/shared/src/index.ts');
      if (fs.existsSync(idx)) return { path: idx };
      return null;
    });
  },
};

try {
  await esbuild.build({
    entryPoints: [path.join(claweDir, 'packages/cli/src/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile,
    external: ['convex'],
    plugins: [workspacePlugin],
    logLevel: 'warning',
  });
  console.log(`✓ CLI bundled → ${outfile}`);
} catch (err) {
  console.error('CLI bundle failed:', err.message);
  process.exit(1);
}
