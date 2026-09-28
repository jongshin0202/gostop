import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30000,
  expect:{timeout:7000},
  retries:0,
  workers:1,
  use:{
    baseURL:'http://127.0.0.1:4173',
    headless:true,
    launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{
      executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    }:{},
    trace:'retain-on-failure',
    screenshot:'only-on-failure'
  },
  webServer:{
    command:'python3 -m http.server 4173 --bind 127.0.0.1',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:false,
    timeout:15000
  }
});
