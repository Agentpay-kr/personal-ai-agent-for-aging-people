import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('docs/design/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:4317', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(output, 'before-home.png'), fullPage: true });
  await page.locator('.mobile-nav').getByRole('button', { name: '몰라와 대화' }).click();
  await page.screenshot({ path: path.join(output, 'before-chat.png'), fullPage: true });
  console.log(JSON.stringify({ output, title: await page.title() }));
} finally {
  await browser.close();
}
