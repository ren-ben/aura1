import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  // The Kael'thos rig is plain TypeScript, drawn live in the browser from the
  // same source as the device's art.
  resolve: { alias: { '@aura/art': fileURLToPath(new URL('../art/src', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
