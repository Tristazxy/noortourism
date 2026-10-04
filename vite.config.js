import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// base './' keeps every URL relative, so the same build works on Lovable (served at /)
// and on GitHub Pages (served at /<repo>/).
export default defineConfig({
  base: './',
  server: { host: '::', port: 8080 },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        eval: fileURLToPath(new URL('./eval.html', import.meta.url)),
      },
    },
  },
});
