/**
 * Build script — bundles TypeScript to a single CJS bundle
 */
import { build } from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

const outdir = path.join(process.cwd(), 'dist');
const srcdir = path.join(process.cwd(), 'src');

// Clean dist
try { fs.rmSync(outdir, { recursive: true }); } catch { /* ignore */ }

await build({
  entryPoints: [path.join(srcdir, 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20.0',
  outdir,
  external: ['sharp'], // Native addon — keep as external
  logLevel: 'info',
});

// Rename cli.js → cli.cjs (so Node treats it as CJS despite "type": "module")
const jsPath = path.join(outdir, 'cli.js');
const cjsPath = path.join(outdir, 'cli.cjs');
if (fs.existsSync(jsPath)) {
  fs.renameSync(jsPath, cjsPath);
}

// Make the output executable
const cliPath = cjsPath;
const stats = fs.statSync(cliPath);
fs.chmodSync(cliPath, stats.mode | 0o755);

console.log('✅ Build complete — dist/cli.cjs');
