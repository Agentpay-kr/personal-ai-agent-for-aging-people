import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { palettes } from '../src/design/tokens.ts';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const directory = fileURLToPath(new URL('../../../docs/design', import.meta.url));
const failures = [];
const luminance = color => {
  const channels = color.match(/[a-f\d]{2}/gi).map(hex => parseInt(hex, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrasts = [];
for (const [theme, colors] of Object.entries(palettes)) for (const [foreground, background] of [['ink', 'canvas'], ['muted', 'canvas'], ['ink', 'surface'], ['muted', 'surface'], ['ink', 'quiet'], ['success', 'quiet'], ['accentInk', 'accent'], ['onAction', 'action'], ['danger', 'surface']]) {
  const first = luminance(colors[foreground]); const second = luminance(colors[background]);
  const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  contrasts.push({ theme, foreground, background, ratio: Number(ratio.toFixed(2)), passes: ratio >= 4.5 });
  if (ratio < 4.5) failures.push(`Low contrast: ${theme} ${foreground}/${background}`);
}
const browser = await chromium.launch({ channel: process.env.MOLLA_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const targetReports = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto(process.env.MOLLA_PREVIEW_URL || 'http://127.0.0.1:4321', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('start-conversation')).toBeVisible();
  async function auditTargets(screen) {
    const targets = await page.locator('[role="button"], [role="tab"], [role="radio"], a').evaluateAll(elements => elements.filter(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return !element.closest('[aria-hidden="true"]') && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && hit && element.contains(hit) && rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
    }).map(element => { const rect = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') || element.textContent.trim(), width: Number(rect.width.toFixed(1)), height: Number(rect.height.toFixed(1)), disabled: element.getAttribute('aria-disabled') === 'true' }; }));
    targetReports.push({ screen, targets });
    for (const target of targets) if (target.width < 48 || target.height < 48) failures.push(`Small target on ${screen}: ${target.label} (${target.width} × ${target.height})`);
  }
  await auditTargets('home');
  await page.getByTestId('start-conversation').focus();
  await expect(page.getByTestId('start-conversation')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('message-input')).toBeVisible();
  await auditTargets('chat');
  await page.getByTestId('message-input').fill('안부 메시지 초안을 준비해줘');
  await page.getByTestId('send-message').click();
  await page.getByRole('button', { name: '부탁 내용 확인하기' }).click();
  await auditTargets('approval');
  await page.getByRole('button', { name: '지금은 괜찮아요' }).click();
  await expect(page.getByText('진행하지 않았어요', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '확인했어요' }).click();
  await page.getByTestId('nav-profile').click();
  await auditTargets('profile');
  await page.screenshot({ path: path.join(directory, 'screenshots/mobile-profile-390.png') });
  await page.getByRole('button', { name: '체험 대화 지우기' }).click();
  await page.getByRole('button', { name: '대화 유지하기' }).click();
  await page.getByTestId('nav-chat').click();
  await expect(page.getByText('안부 메시지 초안을 준비해줘', { exact: true })).toBeVisible();
  const art = await browser.newPage({ viewport: { width: 1380, height: 1100 } });
  await art.goto(new URL('../../../docs/design/directions.html', import.meta.url).href);
  await art.evaluate(() => document.fonts.ready);
  await art.screenshot({ path: path.join(directory, 'screenshots/art-directions.png'), fullPage: true });
  const report = { passed: failures.length === 0, failures, contrasts, targetReports, checks: ['18 semantic text contrast pairs', 'visible touch target geometry', 'keyboard focus and Enter activation', 'manual rejection', 'cancel destructive reset', 'reduced-motion preference'], limits: ['Browser target geometry is not a native accessibility-tree test.', 'Native Dynamic Type, VoiceOver/TalkBack, haptics and soft keyboard need device review.'] };
  await writeFile(path.join(directory, 'accessibility-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (failures.length) process.exitCode = 1;
} finally { await browser.close(); }
