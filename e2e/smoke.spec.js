import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('tiger-coi-reload', '1');
    localStorage.setItem('tiger-deploy-id', 'dev');
    localStorage.setItem('tiger-install-prompt-dismissed', '1');
    localStorage.setItem('tiger-install-prompt-seen', '1');
  });
});

test.describe('Tiger PWA smoke', () => {
  test('home page loads with app title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#header-title')).toHaveText('Tiger');
    await expect(page.locator('#btn-new')).toBeVisible();
  });

  test('creates a new session and shows record UI', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-new').click();
    await expect(page.locator('#header-title')).not.toHaveText('Tiger');
    await expect(page.getByRole('button', { name: /record/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Transcript' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Assist' })).toBeVisible();
  });

  test('settings page shows runtime and whisper panels', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText('Enhanced transcription (Whisper)')).toBeVisible();
    await expect(page.getByText('On-device runtime')).toBeVisible();
    await expect(page.getByText('Live clinical assist')).toBeVisible();
  });

  test('manifest and icons are served', async ({ request }) => {
    const manifest = await request.get('/manifest.json');
    expect(manifest.ok()).toBeTruthy();
    const json = await manifest.json();
    expect(json.name).toBe('Tiger');

    for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']) {
      const res = await request.get(`/${icon}`);
      expect(res.ok(), `${icon} should exist`).toBeTruthy();
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('CSP is applied via service worker, not meta tag', async ({ request }) => {
    const html = await (await request.get('/index.html')).text();
    expect(html).not.toMatch(/http-equiv=["']Content-Security-Policy["']/i);
  });

  test('service worker registers', async ({ page }) => {
    await page.goto('/');
    const registered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const { CONFIG } = await import('./config.js');
      const swUrl = `./sw.js?v=${encodeURIComponent(CONFIG.deployId)}`;
      const reg = await navigator.serviceWorker.getRegistration(swUrl);
      return !!reg || !!(await navigator.serviceWorker.register(swUrl));
    });
    expect(registered).toBeTruthy();
  });
});

test.describe('Install prompt', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('tiger-coi-reload', '1');
      localStorage.setItem('tiger-deploy-id', 'dev');
      localStorage.removeItem('tiger-install-prompt-dismissed');
    localStorage.removeItem('tiger-install-prompt-seen');
    sessionStorage.removeItem('tiger-install-prompt-seen');
    });
  });

  test('shows add to home screen guide in browser', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#install-prompt')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('heading', { name: /Install Tiger/i })).toBeVisible();
    await page.locator('#install-prompt-got-it').click();
    await expect(page.locator('#install-prompt')).toHaveCount(0);
  });
});
