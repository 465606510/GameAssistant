import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { voidPlugin } from 'void'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), voidPlugin()],
})

