import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode demo` makes one self-contained page on sample data,
// for showing the console without the API.
export default defineConfig(({ mode }) => ({
  plugins: [vue(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: mode === 'demo' ? { outDir: 'dist-demo', assetsInlineLimit: 100_000_000 } : {},
}));
