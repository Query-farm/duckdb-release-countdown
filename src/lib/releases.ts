export const CALENDAR_URL = 'https://duckdb.org/release_calendar';
export const DAY = 86_400_000;
export const TARGET_VERSION = '2.0.0';

export interface Release {
  version: string;
  date: string;
  lts: boolean;
  codename: string | null;
  endOfLife: string | null;
  url: string;
}

export interface Calendar {
  fetchedAt: string;
  source: string;
  upcoming: Release[];
  releases: Release[];
  sourceStatus?: 'live' | 'snapshot';
}

export function timestamp(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(timestamp(value))
    && new Date(timestamp(value)).toISOString().slice(0, 10) === value;
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export function releaseLine(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

export type LedgerFilter = 'recent' | 'upcoming' | 'lts';

export function getLedgerGroups(calendar: Calendar, filter: LedgerFilter, now = Date.now()) {
  const released = calendar.releases.filter((release) => timestamp(release.date) <= now);
  const rows = filter === 'upcoming' ? calendar.upcoming
    : filter === 'lts' ? released.filter((release) => release.lts) : released;
  const branches = new Map<string, Release[]>();
  for (const release of rows) {
    const line = releaseLine(release.version);
    const group = branches.get(line) ?? [];
    group.push(release);
    branches.set(line, group);
  }
  const groups = [...branches].sort(([a], [b]) => compareVersions(`${b}.0`, `${a}.0`))
    .map(([line, releases]) => ({
      line,
      codename: [...released, ...calendar.upcoming].find((release) => releaseLine(release.version) === line && release.codename)?.codename,
      lts: releases.some((release) => release.lts),
      releases: releases.sort((a, b) => filter === 'upcoming'
        ? timestamp(a.date) - timestamp(b.date) || compareVersions(a.version, b.version)
        : compareVersions(b.version, a.version)),
    }));
  // Keep complete branch histories rather than cutting off a branch mid-table.
  return filter === 'recent' ? groups.slice(0, 2) : groups;
}

export type CountdownStatus = 'unannounced' | 'countdown' | 'release-day' | 'awaiting';

export function getCountdownStatus(release: Release | undefined, now = Date.now()): CountdownStatus {
  if (!release) return 'unannounced';
  const plannedTime = timestamp(release.date);
  return now < plannedTime ? 'countdown' : now < plannedTime + DAY ? 'release-day' : 'awaiting';
}

export function getReleaseState(calendar: Calendar, now = Date.now()) {
  // A date passing does not confirm a release. Only the past-releases table does.
  const released = calendar.releases.filter((r) => timestamp(r.date) <= now);
  const latest = [...released].sort((a, b) => timestamp(b.date) - timestamp(a.date) || compareVersions(b.version, a.version))[0];
  const targetReleased = released.find((r) => r.version === TARGET_VERSION);
  const target = targetReleased ?? calendar.upcoming.find((r) => r.version === TARGET_VERSION);
  const lts = [...released].filter((r) => r.lts && r.endOfLife)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  const ltsPatch = lts && [...released].filter((r) => releaseLine(r.version) === releaseLine(lts.version))
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  const targetStatus = targetReleased ? 'released' as const : getCountdownStatus(target, now);
  return { latest, target, targetStatus, lts, ltsPatch };
}

export function duration(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  };
}

export function releaseTiming(date: string, planned: boolean, now = Date.now()) {
  const elapsed = now - timestamp(date);
  if (planned && elapsed >= 0 && elapsed < DAY) {
    return { text: 'Today', label: 'Planned for today; awaiting release confirmation' };
  }
  const { days, hours } = duration(Math.abs(elapsed));
  const short = days ? `${days}d ${hours}h` : hours ? `${hours}h` : '<1h';
  const long = days || hours ? `${days} ${days === 1 ? 'day' : 'days'}, ${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'Less than one hour';
  if (planned && elapsed >= DAY) {
    return { text: `${short} late`, label: `${long} since the planned date; awaiting release confirmation` };
  }
  return { text: short, label: `${long} ${planned ? 'until the planned release date' : 'since release'}` };
}

export function releaseInterval(release: Release, calendar: Calendar, planned: boolean) {
  const line = releaseLine(release.version);
  const candidates = planned ? [...calendar.releases, ...calendar.upcoming] : calendar.releases;
  const previous = candidates.filter((r) => releaseLine(r.version) === line
    && compareVersions(r.version, release.version) < 0 && timestamp(r.date) <= timestamp(release.date))
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  if (!previous) return { text: '—', label: `No earlier release is listed in the ${line} branch` };
  const days = Math.round((timestamp(release.date) - timestamp(previous.date)) / DAY);
  return {
    text: `${planned ? '~' : ''}${days}d`,
    label: `${planned ? 'Tentative interval: ' : ''}${days} ${days === 1 ? 'day' : 'days'} after v${previous.version} (${formatDate(previous.date)}) in the ${line} branch`,
  };
}

export function formatDate(date: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: style === 'long' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(timestamp(date)));
}

export function remainingFraction(start: string, end: string, now: number): number {
  const span = timestamp(end) - timestamp(start);
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (timestamp(end) - now) / span));
}

export function makeCalendarEvent(release: Release, fetchedAt: string): string {
  const compactDate = (date: string) => date.replaceAll('-', '');
  const end = new Date(timestamp(release.date) + DAY).toISOString().slice(0, 10);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Query.Farm//DuckDB Release Watch//EN',
    'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:duckdb-${release.version}@duckdb-release-clock.query.farm`,
    `DTSTAMP:${new Date(fetchedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${compactDate(release.date)}`,
    `DTEND;VALUE=DATE:${compactDate(end)}`,
    `SUMMARY:DuckDB ${release.version} release (tentative)`,
    'DESCRIPTION:Planned release date. Timing may change. Check the official',
    '  DuckDB release calendar before making plans.',
    `URL:${CALENDAR_URL}`, 'STATUS:TENTATIVE', 'TRANSP:TRANSPARENT',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
