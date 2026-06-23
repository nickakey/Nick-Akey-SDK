import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'], // The entry point(s) for the build process
  format: ['esm', 'cjs'], // Output formats: ES Modules and CommonJS
  dts: true, // Generate TypeScript declaration (.d.ts) files
  clean: true, // Clean the output directory before building
  sourcemap: true, // Generate source maps for the output files
});
