import {defineConfig,devices} from '@playwright/test';
const port=Number(process.env.DEMO_TEST_PORT||5051);
export default defineConfig({
  testDir:'./demo-e2e',workers:1,retries:0,timeout:45000,
  use:{baseURL:`http://127.0.0.1:${port}/hpw_ARB/`,trace:'retain-on-failure',
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'node scripts/serve-demo.mjs',url:`http://127.0.0.1:${port}/hpw_ARB/`,reuseExistingServer:false},
});
