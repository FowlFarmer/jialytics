import { defineConfig } from 'tsup';

const shared = {
  format: 'esm' as const,
  dts: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'three', 'mongodb'],
};

export default defineConfig([
  // Server: the request handler and the database adapters.
  {
    ...shared,
    entry: {
      index: 'src/server/index.ts',
      node: 'src/server/node.ts',
      'adapters/memory': 'src/adapters/memory.ts',
      'adapters/mongodb': 'src/adapters/mongodb.ts',
      'adapters/postgres': 'src/adapters/postgres.ts',
      'adapters/redis': 'src/adapters/redis.ts',
    },
    splitting: true,
  },
  // Browser: the tracker and the dashboard. Bundling drops "use client" from the sources, so it
  // goes back on as a banner for frameworks with server components (Next.js app router).
  {
    ...shared,
    entry: {
      client: 'src/client/index.ts',
      react: 'src/client/react.tsx',
      dashboard: 'src/dashboard/index.ts',
    },
    splitting: true,
    banner: { js: '"use client";' },
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
  },
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
