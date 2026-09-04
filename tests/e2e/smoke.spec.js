import { test, expect } from '@playwright/test';

/**
 * Client-only boot checks. The API is not started for this run, so the silent
 * session refresh on load is expected to fail — that path is covered by the
 * server and client suites. What matters here is that the app still boots,
 * routes correctly, and styles itself.
 */
const API_ORIGIN = 'localhost:5000';

test.describe('application boot', () => {
  test('redirects an unauthenticated visitor from the workspace to sign-in', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('offers the full set of auth routes', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  });

  test('refuses to show the reset form without a token', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page.getByRole('heading', { name: /link is incomplete/i })).toBeVisible();
    await expect(page.getByLabel('New password')).toHaveCount(0);
  });

  test('renders the not-found page for an unknown route', async ({ page }) => {
    await page.goto('/definitely-not-a-route');

    await expect(page.getByRole('heading', { name: /does not exist/i })).toBeVisible();
  });

  test('applies the design-system stylesheet rather than unstyled HTML', async ({ page }) => {
    await page.goto('/sign-in');

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        gold: style.getPropertyValue('--gold-start').trim(),
        background: style.getPropertyValue('--background').trim(),
        border: style.getPropertyValue('--border-default').trim(),
        body: getComputedStyle(document.body).backgroundColor,
      };
    });

    expect(tokens.gold).toBe('#f6c744');
    expect(tokens.background).toBe('#02090d');
    expect(tokens.border).not.toBe('');

    // The theme is dark, so the page must actually be painted dark rather than
    // relying on the browser's white default showing through.
    expect(tokens.body).toBe('rgb(2, 9, 13)');

    // A Tailwind base reset zeroes body margin; unstyled HTML leaves 8px.
    expect(await page.evaluate(() => getComputedStyle(document.body).marginTop)).toBe('0px');
  });

  test('boots without an uncaught exception or an application console error', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // The API is deliberately not running for this suite; a refused request to
      // it is expected and is not an application fault.
      if (msg.text().includes(API_ORIGIN) || msg.text().includes('Failed to load resource')) return;
      consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
