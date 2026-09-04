import { test, expect } from '@playwright/test';

/**
 * The whole journey against the real stack: sign up, describe a story, watch it
 * build itself, edit a page, export a file, publish it.
 *
 * This is the regression test the unit suites cannot be — every layer is real
 * here (HTTP, Mongo, storage, the renderers), and the only stand-ins are the AI
 * providers, which answer from `npm run dev:stub`.
 *
 * It is skipped rather than failed when the API is not running, so a bare
 * `npm run test:e2e` still checks what it can instead of reporting a fake
 * failure.
 *
 * Only ever run this against `npm run dev:stub`. It signs up and writes books;
 * pointed at a real server it would do both for real.
 */
const API = 'http://127.0.0.1:5000/api/v1';

const account = () => ({
  name: 'Journey Runner',
  email: `journey+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`,
  password: 'Str0ng!Passw0rd',
});

async function apiUp(request) {
  try {
    const res = await request.get(`${API}/health`, { timeout: 3000 });
    return res.ok();
  } catch {
    return false;
  }
}

/** Signs up through the UI and lands on the dashboard. */
async function signUp(page, user) {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

test.describe('the whole journey', () => {
  test.slow();

  test.beforeEach(async ({ request }) => {
    test.skip(!(await apiUp(request)), 'API is not running — start it with npm run dev:stub');
  });

  test('sign up, describe a story, watch it build, edit, export, publish', async ({
    page,
    request,
  }) => {
    const user = account();
    await signUp(page, user);

    // --- describe -------------------------------------------------------------
    // "Create Storybook" is the row that opens the agent; the Story Agent group
    // that used to carry its own row was removed.
    await page.getByRole('link', { name: 'Create Storybook' }).click();
    await page
      .getByPlaceholder(/A curious boy finds a forest/i)
      .fill('A boy and a firefly explore a whispering forest at night');
    await page.getByRole('button', { name: /create the story plan/i }).click();

    // The one question a run asks. Its default is already chosen.
    await page.getByRole('button', { name: /create my book/i }).click();

    // --- and then it builds itself --------------------------------------------
    // No plan review, no cast screen, no "illustrate" button: the run draws the
    // characters, then every page, then the cover, on its own.
    await expect(page.getByRole('heading', { name: 'Making Your Book' })).toBeVisible({
      timeout: 60_000,
    });

    const bookId = page.url().match(/books\/([a-f0-9]{24})/)?.[1];
    expect(bookId, 'a book id should be in the URL').toBeTruthy();

    await expect(page.getByText('Your book is ready')).toBeVisible({ timeout: 180_000 });

    // --- edit -----------------------------------------------------------------
    await page.getByRole('button', { name: /Edit pages/ }).click();
    await expect(page.getByRole('heading', { name: /Whispering Forest/ })).toBeVisible();

    await page.getByRole('tab', { name: 'Text' }).click();
    const title = page.getByLabel('Page title');
    await title.fill('An Edited Title');
    // The status appears in both the header badge and the bottom bar.
    await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 15_000 });

    // The edit survives a reload, which is what proves it reached the database.
    await page.reload();
    await page.getByRole('tab', { name: 'Text' }).click();
    await expect(page.getByLabel('Page title')).toHaveValue('An Edited Title');

    // --- export ---------------------------------------------------------------
    await page.getByRole('button', { name: 'Preview Book' }).click();
    await expect(page.getByRole('heading', { name: 'Preview & Export Your Book' })).toBeVisible();
    await expect(page.getByText('All pages look good.')).toBeVisible();

    await page.getByRole('button', { name: /Export & Download/ }).click();

    const download = page.getByRole('link', { name: /Download .*\.pdf/ });
    await expect(download).toBeVisible({ timeout: 60_000 });

    // Fetch the file the link points at and check it really is a PDF.
    const href = await download.getAttribute('href');
    const file = await request.get(`http://127.0.0.1:5000${href}`);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toContain('application/pdf');

    const bytes = await file.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);

    // --- publish --------------------------------------------------------------
    await page.getByRole('button', { name: 'Publish Book' }).click();
    await expect(page.getByRole('button', { name: /Published/ })).toBeVisible();

    await page.getByRole('link', { name: 'Published Books' }).click();
    // The page title and the section heading share the name.
    await expect(
      page.getByRole('heading', { name: 'Published Books', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/Whispering Forest|An Edited Title/).first()).toBeVisible();
  });

  test('one account cannot reach another account’s book', async ({ page, request }) => {
    const owner = account();
    await signUp(page, owner);

    // Make a book as the first account, through the API for speed.
    const login = await request.post(`${API}/auth/login`, {
      data: { email: owner.email, password: owner.password },
    });
    const token = (await login.json()).data.accessToken;

    const plan = await request.post(`${API}/story/plan`, {
      headers: { authorization: `Bearer ${token}` },
      data: { prompt: 'A quiet dragon who collects lost buttons', settings: { pageCount: 4 } },
    });
    const bookId = (await plan.json()).data.bookId;

    // Now become somebody else entirely and ask for it.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/sign-in/);

    const stranger = account();
    await signUp(page, stranger);

    await page.goto(`/books/${bookId}/editor`);
    await expect(page.getByText(/could not load this book/i)).toBeVisible({ timeout: 15_000 });
  });
});
