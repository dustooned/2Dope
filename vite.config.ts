import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:lan` serves over HTTPS on the local network so an iPad can test pen input.
export default defineConfig(({ mode }) => ({
  // Relative asset paths, so the build works from any folder (GitHub Pages serves it under /2Dope/).
  base: './',
  plugins: mode === 'lan' ? [basicSsl()] : [],
  server: { port: 5180 },
}));
