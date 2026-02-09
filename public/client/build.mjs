import * as esbuild from 'esbuild';

// Bundle all modules into a single IIFE (like the original JS)
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  sourcemap: true,
  format: 'iife',
  target: ['es2020'],
  outfile: 'dist/meta-tracker.js',
  globalName: '_MetaTrackerBundle',
});

// Also build a minified version
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'iife',
  target: ['es2020'],
  outfile: 'dist/meta-tracker.min.js',
  globalName: '_MetaTrackerBundle',
});

console.log('Build complete: dist/meta-tracker.js + dist/meta-tracker.min.js');
