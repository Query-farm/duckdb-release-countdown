import { load } from 'cheerio/slim';
import { CALENDAR_URL, compareVersions, isDate, type Calendar, type Release } from './releases.ts';

export function parseCalendar(html: string, fetchedAt = new Date().toISOString()): Calendar {
  const $ = load(html);
  const readTable = (heading: string, past: boolean): Release[] => {
    const section = $(heading);
    if (!section.length) throw new Error(`Release calendar section missing: ${heading}`);
    const table = section.nextUntil('h2').filter('table').first();
    if (!table.length && !past && /no upcoming releases/i.test(section.nextUntil('h2').text())) return [];
    if (!table.length) throw new Error(`Release calendar table missing: ${heading}`);
    return table.find('tbody tr').toArray().map((row) => {
      const cells = $(row).find('td');
      const date = cells.eq(past ? 1 : 0).text().trim();
      const versionText = cells.eq(past ? 2 : 1).text().trim();
      const version = versionText.match(/\b\d+\.\d+\.\d+\b/)?.[0];
      if (!isDate(date) || !version) throw new Error('Unrecognized release row; preserving the last known calendar.');
      const endOfLife = past ? cells.eq(4).text().trim() : '';
      if (endOfLife && !isDate(endOfLife)) throw new Error(`Invalid end-of-life date for ${version}`);
      const rawURL = cells.eq(past ? 2 : 1).find('a').attr('href');
      const url = rawURL ? new URL(rawURL, CALENDAR_URL) : new URL(`${CALENDAR_URL}#upcoming-releases`);
      if (url.protocol !== 'https:' || !['duckdb.org', 'www.duckdb.org', 'github.com'].includes(url.hostname)) {
        throw new Error('Unexpected release link');
      }
      return {
        date, version, lts: /\bLTS\b/i.test(versionText),
        codename: past ? cells.eq(3).text().trim().split(/\s*\(/)[0].trim() || null : null,
        endOfLife: endOfLife || null, url: url.href,
      };
    });
  };
  const releases = readTable('#past-releases', true);
  if (!releases.length) throw new Error('Calendar contains no released versions');
  const upcoming = readTable('#upcoming-releases', false).sort((a, b) => a.date.localeCompare(b.date) || compareVersions(a.version, b.version));
  for (const rows of [releases, upcoming]) {
    if (new Set(rows.map((r) => r.version)).size !== rows.length) throw new Error('Duplicate release version');
  }
  return { source: CALENDAR_URL, fetchedAt, upcoming, releases };
}

export async function fetchCalendar(): Promise<Calendar> {
  const response = await fetch(CALENDAR_URL, {
    headers: { 'Accept': 'text/html', 'User-Agent': 'QueryFarmReleaseClock/1.0 (+https://duckdb-release-clock.query.farm)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`DuckDB calendar returned HTTP ${response.status}`);
  return parseCalendar(await response.text());
}
