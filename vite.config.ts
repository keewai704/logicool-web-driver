import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolveBasePath } from './src/config/pagesBase';

export default defineConfig({
  base: resolveBasePath(process.env.GITHUB_REPOSITORY),
  plugins: [react()],
});
