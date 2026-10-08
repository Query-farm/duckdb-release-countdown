import { test, expect } from '@playwright/test';
import snapshot from '../fixtures/calendar.json' with { type: 'json' };

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T12:34:55Z') });
  await page.clock.pauseAt(new Date('2026-10-08T12:34:56Z'));
  // Keep tests independent of the production snapshot, which changes at build time.
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace(/<script\b[^>]*id="calendar-data"[^>]*>[\s\S]*?<\/script>/,
      `<script id="calendar-data" type="application/json">${JSON.stringify(snapshot)}</script>`) });
  });
  await page.route('**/api/releases', (route) => route.fulfill({ json: { ...snapshot, fetchedAt: '2026-10-08T12:34:56Z', sourceStatus: 'live' } }));
});

test('clocks tick, fit the viewport, and filters show relevant releases', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#release-clock')).toHaveAttribute('aria-label', /12 days, 11 hours, 25 minutes, 4 seconds/);
  await expect(page.locator('#latest-version')).toHaveText('v1.5.6');
  await expect(page.locator('#lts-end')).toHaveText('17 Nov 2026');
  await page.clock.runFor(1000);
  await expect(page.locator('#release-clock')).toHaveAttribute('aria-label', /25 minutes, 3 seconds/);
  await expect(page.locator('#latest-clock')).toHaveAttribute('aria-label', /10 days, 12 hours, 34 minutes, 57 seconds/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Recent', exact: true }).click();
  await expect(page.locator('#release-age-heading')).toHaveText('Age');
  await expect(page.locator('.branch-heading strong')).toHaveText(['DuckDB 1.5', 'DuckDB 1.4']);
  const branch15 = page.locator('[data-release-line="1.5"]');
  const branch14 = page.locator('[data-release-line="1.4"]');
  await expect(branch15.locator('.release-row th')).toHaveText([
    'DuckDB 1.5.6', 'DuckDB 1.5.5', 'DuckDB 1.5.4', 'DuckDB 1.5.3', 'DuckDB 1.5.2', 'DuckDB 1.5.1', 'DuckDB 1.5.0',
  ]);
  await expect(branch14.locator('.release-row th')).toHaveText([
    'DuckDB 1.4.5', 'DuckDB 1.4.4', 'DuckDB 1.4.3', 'DuckDB 1.4.2', 'DuckDB 1.4.1', 'DuckDB 1.4.0',
  ]);
  await expect(branch15.locator('.branch-count')).toHaveText('7 releases');
  await expect(branch14.locator('.branch-count')).toHaveText('6 releases');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#release-table .release-row').first()).toContainText('1.5.6');
  await expect(page.locator('#release-table .release-age').first()).toHaveText('10d 12h');
  await expect(page.locator('#release-table .release-interval').first()).toHaveText('68d');
  await expect(page.locator('#release-table .release-interval').first()).toHaveAttribute('title', /after v1.5.5/);
  await page.getByRole('button', { name: 'LTS', exact: true }).click();
  await expect(page.locator('#release-table .release-row').first()).toContainText('1.4.5');
  await expect(page.locator('#release-table .release-row').first()).toContainText('Supported LTS');
  await expect(page.locator('#release-table .release-age').first()).toHaveText('113d 12h');
  await expect(page.locator('#release-table .release-interval').first()).toHaveText('141d');
  await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.locator('#release-table .release-row')).toHaveCount(2);
  await expect(page.locator('#release-age-heading')).toHaveText('Timing');
  await expect(page.locator('#release-table .release-age').first()).toHaveText('12d 11h');
  await expect(page.locator('#release-table .release-interval').first()).toHaveText('—');
  await expect(page.locator('#release-table .release-interval').nth(1)).toHaveText('~28d');
  expect(errors).toEqual([]);
});

test('focus mode and calendar download work without the schedule', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.schedule-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Enter focus mode' }).click();
  await expect(page.locator('.secondary-clocks')).toBeHidden();
  await expect(page.locator('#release-ledger')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit focus mode' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.secondary-clocks')).toBeVisible();
  await expect(page.locator('#release-ledger')).toBeVisible();
  const event = await page.locator('#calendar-download').evaluate(async (node) => await (await fetch((node as HTMLAnchorElement).href)).text());
  expect(event).toContain('DTSTART;VALUE=DATE:20261021');
  expect(event).toContain('STATUS:TENTATIVE');
  await page.getByText('How we keep time', { exact: false }).click();
  await expect(page.locator('.methodology')).toBeVisible();
});

test('planned date passing does not claim a release; expired LTS stays at zero', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T00:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#target-badge')).toHaveText('Release day');
  await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.locator('#release-table .release-age').first()).toHaveText('Today');
  await page.clock.setFixedTime(new Date('2026-11-18T00:00:00Z'));
  await page.clock.runFor(1000);
  await expect(page.locator('#target-badge')).toHaveText('Awaiting release');
  await expect(page.locator('#release-table .release-age').first()).toHaveText('28d 0h late');
  await expect(page.locator('#lts-status')).toHaveText('Support ended');
  await expect(page.locator('#lts-clock')).toHaveAttribute('aria-label', /0 days, 0 hours, 0 minutes, 0 seconds/);
});

test('live calendar changes update clocks and downloads; unavailable source retains dates', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#source-label')).toHaveText('Official calendar connected');
  await page.route('**/api/releases', (route) => route.fulfill({ json: {
    ...snapshot, sourceStatus: 'live', fetchedAt: '2026-10-08T12:35:00Z',
    upcoming: snapshot.upcoming.map((r) => r.version === '2.0.0' ? { ...r, date: '2026-10-28' } : r),
  } }));
  await page.getByRole('button', { name: /Refresh source/ }).click();
  await expect(page.locator('#target-date')).toHaveText('28 October 2026');
  const event = await page.locator('#calendar-download').evaluate(async (node) => await (await fetch((node as HTMLAnchorElement).href)).text());
  expect(event).toContain('DTSTART;VALUE=DATE:20261028');
  await page.route('**/api/releases', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: /Refresh source/ }).click();
  await expect(page.locator('#source-label')).toHaveText('Source unavailable · saved dates');
  await expect(page.locator('#target-date')).toHaveText('28 October 2026');
});

test('confirmed release turns the countdown into a count-up', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
  await page.route('**/api/releases', (route) => route.fulfill({ json: {
    ...snapshot, sourceStatus: 'live', fetchedAt: '2026-10-22T12:00:00Z',
    upcoming: snapshot.upcoming.filter((r) => r.version !== '2.0.0'),
    releases: [{ version: '2.0.0', date: '2026-10-21', lts: true, codename: 'Cyanoptera', endOfLife: '2027-10-21', url: 'https://duckdb.org/release_calendar' }, ...snapshot.releases],
  } }));
  await page.goto('/');
  await expect(page.locator('#target-badge')).toHaveText('Released');
  await expect(page.locator('#release-clock')).toHaveAttribute('aria-label', /Time since DuckDB 2.0 release: 1 days, 12 hours/);
  await expect(page.locator('#latest-version')).toHaveText('v2.0.0');
  await expect(page.locator('#lts-version')).toHaveText('v2.0 LTS');
  await expect(page.locator('#calendar-download')).not.toHaveAttribute('download');
});

test('announced patch releases stay in the grouped ledger', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.secondary-clocks .clock-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Time since last release.' })).toBeVisible();
  const patch = { ...snapshot.upcoming[0], version: '1.5.7', date: '2026-10-14' };
  await page.route('**/api/releases', (route) => route.fulfill({ json: {
    ...snapshot, sourceStatus: 'live', fetchedAt: '2026-10-08T12:35:00Z',
    upcoming: [...snapshot.upcoming, patch],
  } }));
  await page.getByRole('button', { name: /Refresh source/ }).click();
  await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await expect(page.locator('.branch-heading strong')).toHaveText(['DuckDB 2.0', 'DuckDB 1.5']);
  const row = page.locator('[data-release-line="1.5"] .release-row');
  await expect(row).toContainText('1.5.7');
  await expect(row.locator('.release-age')).toHaveText('5d 11h');
  await expect(row.locator('.release-interval')).toHaveText('~16d');
  await expect(page.locator('#latest-version')).toHaveText('v1.5.6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
