import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),],
  build: {
    // 1. Tell Vite to output the build directly into your backend folder!
    outDir: '../backend/dist',
    
    // 2. Tell Vite it is allowed to delete the old files before building the new ones
    emptyOutDir: true,
  }
})
