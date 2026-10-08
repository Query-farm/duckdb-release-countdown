import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fetchCalendar } from '../src/lib/calendar-source.ts';

const destination = new URL('../src/data/calendar.json', import.meta.url);
try {
  const calendar = await fetchCalendar();
  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  await writeFile(`${destination.pathname}.tmp`, `${JSON.stringify(calendar, null, 2)}\n`);
  await rename(`${destination.pathname}.tmp`, destination);
  console.log(`Calendar refreshed: ${calendar.releases.length} releases, ${calendar.upcoming.length} planned.`);
} catch (error) {
  // Offline builds remain possible, but never relabel a snapshot as fresh.
  const snapshot = JSON.parse(await readFile(destination, 'utf8'));
  console.warn(`Using calendar snapshot from ${snapshot.fetchedAt}. ${error instanceof Error ? error.message : error}`);
  if (process.env.REQUIRE_FRESH_CALENDAR === '1') process.exitCode = 1;
}
