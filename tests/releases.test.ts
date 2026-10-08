import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar } from '../src/lib/calendar-source.ts';
import { DAY, duration, getReleaseState, makeCalendarEvent, releaseInterval, releaseTiming, remainingFraction, timestamp, type Calendar, type Release } from '../src/lib/releases.ts';
import snapshot from './fixtures/calendar.json' with { type: 'json' };

const now = timestamp('2026-10-08');
const release = (version: string, date: string, rest: Partial<Release> = {}): Release => ({ version, date, lts: false, codename: null, endOfLife: null, url: 'https://duckdb.org/release_calendar', ...rest });
const fixture: Calendar = {
  fetchedAt: '2026-10-08T00:00:00Z', source: 'https://duckdb.org/release_calendar',
  upcoming: [release('2.0.0', '2026-10-21')],
  releases: [
    release('1.5.6', '2026-09-28'),
    release('1.5.0', '2026-03-09'),
    release('1.4.5', '2026-06-17', { lts: true }),
    release('1.4.0', '2025-09-16', { lts: true, endOfLife: '2026-11-17', codename: 'Andium' }),
  ],
};

test('calendar snapshot has the verified dates, including the extended LTS end date', () => {
  const state = getReleaseState(snapshot, now);
  assert.equal(state.target?.date, '2026-10-21');
  assert.equal(state.latest?.version, '1.5.6');
  assert.equal(state.lts?.endOfLife, '2026-11-17');
  assert.equal(state.ltsPatch?.version, '1.4.5');
});

test('UTC countdown boundaries do not depend on the local timezone', () => {
  assert.deepEqual(duration(timestamp('2026-10-21') - Date.parse('2026-10-20T19:59:59-04:00')), { days: 0, hours: 0, minutes: 0, seconds: 1 });
  assert.deepEqual(duration(-1), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(duration(13 * DAY + 3661_000), { days: 13, hours: 1, minutes: 1, seconds: 1 });
});

test('ledger ages distinguish elapsed time, remaining time, release day, and overdue plans', () => {
  const current = Date.parse('2026-10-08T12:34:56Z');
  assert.equal(releaseTiming('2026-09-28', false, current).text, '10d 12h');
  assert.match(releaseTiming('2026-09-28', false, current).label, /since release/);
  assert.equal(releaseTiming('2026-10-21', true, current).text, '12d 11h');
  assert.equal(releaseTiming('2026-10-08', true, current).text, 'Today');
  assert.equal(releaseTiming('2026-10-07', true, current).text, '1d 12h late');
  assert.equal(releaseTiming('2026-10-08', false, timestamp('2026-10-08') + 60_000).text, '<1h');
  assert.equal(releaseTiming('2026-10-09', true, timestamp('2026-10-09') - 60_000).text, '<1h');
});

test('release intervals follow the preceding version in the same branch', () => {
  const stable = snapshot.releases.find((r) => r.version === '1.5.6')!;
  const lts = snapshot.releases.find((r) => r.version === '1.4.5')!;
  assert.equal(releaseInterval(stable, snapshot, false).text, '68d');
  assert.match(releaseInterval(stable, snapshot, false).label, /v1.5.5/);
  assert.equal(releaseInterval(lts, snapshot, false).text, '141d');
  assert.match(releaseInterval(lts, snapshot, false).label, /v1.4.4/);
  assert.equal(releaseInterval(release('1.5.7', '2026-09-28'), snapshot, false).text, '0d');
});

test('planned intervals are tentative and can follow another planned release', () => {
  assert.equal(releaseInterval(snapshot.upcoming[0], snapshot, true).text, '—');
  assert.equal(releaseInterval(snapshot.upcoming[1], snapshot, true).text, '~28d');
  assert.match(releaseInterval(snapshot.upcoming[1], snapshot, true).label, /Tentative interval: 28 days after v2.0.0/);
  // Unconfirmed plans cannot become the predecessor of a confirmed release.
  assert.equal(releaseInterval(snapshot.upcoming[1], snapshot, false).text, '—');
});

test('a planned date passing never implies release confirmation', () => {
  assert.equal(getReleaseState(fixture, now).targetStatus, 'countdown');
  assert.equal(getReleaseState(fixture, timestamp('2026-10-21')).targetStatus, 'release-day');
  assert.equal(getReleaseState(fixture, timestamp('2026-10-22')).targetStatus, 'awaiting');
  const shipped = { ...fixture, upcoming: [], releases: [release('2.0.0', '2026-10-22'), ...fixture.releases] };
  assert.equal(getReleaseState(shipped, timestamp('2026-10-22')).targetStatus, 'released');
  assert.equal(getReleaseState({ ...fixture, upcoming: [] }, now).targetStatus, 'unannounced');
});

test('last release is chronological across release lines, with a version tie-breaker', () => {
  const data = { ...fixture, releases: [...fixture.releases, release('1.4.6', '2026-10-02', { lts: true })] };
  assert.equal(getReleaseState(data, now).latest?.version, '1.4.6');
  data.releases.push(release('1.5.7', '2026-10-02'));
  assert.equal(getReleaseState(data, now).latest?.version, '1.5.7');
  data.releases.push(release('2.0.0', '2026-10-21'));
  assert.equal(getReleaseState(data, now).latest?.version, '1.5.7');
});

test('LTS fraction clamps before launch and after expiry, preserving explicit calendar deadline', () => {
  assert.equal(remainingFraction('2025-09-16', '2026-11-17', timestamp('2025-09-15')), 1);
  assert.equal(remainingFraction('2025-09-16', '2026-11-17', timestamp('2026-11-17')), 0);
  assert.equal(remainingFraction('2025-09-16', '2026-11-17', timestamp('2027-01-01')), 0);
  assert.equal(getReleaseState(fixture, now).lts?.endOfLife, '2026-11-17');
});

test('calendar download is an all-day tentative event with exclusive end date', () => {
  const ics = makeCalendarEvent(release('2.0.0', '2028-02-29'), fixture.fetchedAt);
  assert.match(ics, /DTSTART;VALUE=DATE:20280229\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20280301\r\n/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.ok(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75));
});

const html = `<h2 id="upcoming-releases">Upcoming</h2><p>Tentative.</p>
<table><tbody><tr><td>2026-10-21</td><td>2.0.0</td></tr></tbody></table>
<h3 id="lts-releases">LTS</h3><p>Support information.</p>
<h2 id="past-releases">Past</h2><p>History.</p><table><tbody>
<tr><td></td><td>2026-09-28</td><td><a href="/2026/09/28/announcing-duckdb-156">1.5.6</a></td><td></td><td></td></tr>
<tr><td></td><td>2025-09-16</td><td><a href="https://github.com/duckdb/duckdb/releases/tag/v1.4.0">1.4.0 LTS</a></td><td>Andium (<a>Anas andium</a>)</td><td>2026-11-17</td></tr>
</tbody></table>`;

test('parser extracts dates, LTS markers, codenames and canonical links from calendar tables', () => {
  const parsed = parseCalendar(html, fixture.fetchedAt);
  assert.equal(parsed.upcoming[0].version, '2.0.0');
  assert.equal(parsed.releases[0].url, 'https://duckdb.org/2026/09/28/announcing-duckdb-156');
  assert.equal(parsed.releases[1].lts, true);
  assert.equal(parsed.releases[1].codename, 'Andium');
  assert.equal(parsed.releases[1].endOfLife, '2026-11-17');
});

test('parser fails closed for missing sections, impossible dates or unsafe release links', () => {
  assert.throws(() => parseCalendar('<h1>Service unavailable</h1>'));
  assert.throws(() => parseCalendar(html.replace('2026-10-21', '2026-02-30')));
  assert.throws(() => parseCalendar(html.replace('2026-11-17', 'Unknown')));
  assert.throws(() => parseCalendar(html.replace('/2026/09/28/announcing-duckdb-156', 'javascript:alert(1)')));
});

test('no upcoming releases is valid only when the calendar explicitly says so', () => {
  const empty = html.replace('<table><tbody><tr><td>2026-10-21</td><td>2.0.0</td></tr></tbody></table>', '<p>There are no upcoming releases announced at the moment.</p>');
  assert.deepEqual(parseCalendar(empty).upcoming, []);
});
