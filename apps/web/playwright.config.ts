import { defineConfig } from '@playwright/test';

// Partie de bout en bout : API (Bun) + site (Next) + Postgres (E2E_DATABASE_URL).
const API = 'http://localhost:4100';
const WEB = 'http://localhost:3100';
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://app@localhost/presidente';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: WEB,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: 'bun ../api/src/index.ts',
      url: `${API}/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        DATABASE_URL,
        PORT: '4100',
        API_ORIGIN: API,
        WEB_ORIGIN: WEB,
        BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123',
        GOOGLE_CLIENT_ID: 'e2e',
        GOOGLE_CLIENT_SECRET: 'e2e',
        ENABLE_TEST_LOGIN: 'true',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'bun x next start -p 3100',
      url: WEB,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_URL: API },
    },
  ],
});
