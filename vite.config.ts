import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:lan` serves over HTTPS on the local network so an iPad can test pen input.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'lan' ? [basicSsl()] : [],
  server: { port: 5180 },
}));
