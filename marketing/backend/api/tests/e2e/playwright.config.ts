// Playwright configuration for E2E testing
// Ref: https://playwright.dev/docs/test-configuration
// Ref: https://docs.cypress.io/app/guides/authentication-testing/social-authentication

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Test directory
  testDir: './specs',
  
  // Output directory for test results
  outputDir: './results',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: './reports/html' }],
    ['json', { outputFile: './reports/results.json' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  // Global test configuration
  use: {
    // Base URL for tests
    baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    
    // Record video on failure
    video: 'retain-on-failure',
    
    // Global timeout for all tests
    actionTimeout: 30000,
    navigationTimeout: 30000,
    
    // Extra HTTP headers
    extraHTTPHeaders: {
      'User-Agent': 'Playwright-E2E-Tests/1.0',
    },
    
    // Ignore HTTPS errors in tests
    ignoreHTTPSErrors: true,
  },
  
  // Test projects for different scenarios
  projects: [
    {
      name: 'api-tests',
      testDir: './specs/api',
      use: {
        // API testing doesn't need a browser
        headless: true,
      },
    },
    
    {
      name: 'oauth-flow',
      testDir: './specs/oauth',
      use: {
        ...devices['Desktop Chrome'],
        // Use a clean browser state for OAuth tests
        storageState: undefined,
      },
    },
    
    {
      name: 'publish-flow',
      testDir: './specs/publish',
      use: {
        ...devices['Desktop Chrome'],
        // Use authenticated state
        storageState: './fixtures/auth-state.json',
      },
      dependencies: ['oauth-flow'], // Run after OAuth setup
    },
    
    {
      name: 'webhooks',
      testDir: './specs/webhooks',
      use: {
        headless: true,
      },
    },
    
    // Mobile testing
    {
      name: 'mobile-chrome',
      testDir: './specs/mobile',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  
  // Global setup for all tests
  globalSetup: require.resolve('./setup/global-setup.ts'),
  globalTeardown: require.resolve('./setup/global-teardown.ts'),
  
  // Test timeout
  timeout: 60000,
  expect: {
    // Timeout for expect assertions
    timeout: 10000,
  },
  
  // Web server for tests (optional - start your API server)
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    port: 3000,
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      REDIS_URL: process.env.TEST_REDIS_URL,
    },
  },
});