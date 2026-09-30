import { defineConfig, searchForWorkspaceRoot } from 'vite';
import path from 'path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, '../shared'),
      'shared': path.resolve(rootDir, '../shared'),
    },
  },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        path.resolve(rootDir, '..'),
      ],
    },
    host: '0.0.0.0',
    proxy: { '/api': 'http://127.0.0.1:3000' },
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    hmr: {
      clientPort: 5173,
    },
  },
});

