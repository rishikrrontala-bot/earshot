import { defineConfig } from 'vite';

// GitHub Pages serves this repo under /earshot/.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/earshot/' : '/',
  build: { target: 'es2022' },
});
