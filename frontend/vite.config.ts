import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const BACKEND_URL = 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Kuuntele myös lähiverkossa, jotta kaverit pääsevät samasta verkosta osoitteella http://<oma-ip>:5173
    host: true,
    proxy: {
      '/api': BACKEND_URL,
      '/socket.io': { target: BACKEND_URL, ws: true },
    },
  },
})
