import { defineConfig } from 'vitest/config'

// Unit tests cover the pure helpers in src/lib. supabase.ts calls createClient()
// at import time and throws if VITE_SUPABASE_URL is missing, so provide harmless
// dummy values here — no network is made at construction, so the client never
// actually connects during tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
