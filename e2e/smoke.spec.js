import { test, expect } from '@playwright/test';

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

  test('service worker registers', async ({ page }) => {
    await page.goto('/');
    const registered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration('./sw.js');
      return !!reg || !!(await navigator.serviceWorker.register('./sw.js'));
    });
    expect(registered).toBeTruthy();
  });
});
