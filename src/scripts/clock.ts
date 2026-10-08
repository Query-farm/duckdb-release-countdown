import {
  DAY, CALENDAR_URL, duration, formatDate, getLedgerGroups, getReleaseState,
  isDate, makeCalendarEvent, releaseInterval, releaseLine, releaseTiming, remainingFraction, timestamp,
  type Calendar, type LedgerFilter, type Release,
} from '../lib/releases';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let calendar: Calendar = JSON.parse(element('calendar-data').textContent!);
let filter: LedgerFilter = 'recent';
let fetching = false;
let downloadURL: string | undefined;
let displayedDay = '';
let displayedStatus = '';
let sourceUnavailable = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function write(id: string, value: string) {
  const node = element(id);
  if (node.textContent !== value) node.textContent = value;
}

function setDate(id: string, value: string | null | undefined) {
  const node = element<HTMLTimeElement>(id);
  node.textContent = value ? formatDate(value) : 'Not announced';
  if (value) node.dateTime = value;
  else node.removeAttribute('datetime');
}

function renderClock(id: string, milliseconds: number | null, label: string) {
  const clock = element(id);
  const parts = duration(milliseconds ?? 0);
  for (const unit of ['days', 'hours', 'minutes', 'seconds'] as const) {
    const group = clock.querySelector<HTMLElement>(`[data-unit="${unit}"]`)!;
    const content = milliseconds === null ? '–'.repeat(unit === 'days' ? 3 : 2) : String(parts[unit]).padStart(unit === 'days' ? 3 : 2, '0');
    if (group.childElementCount !== content.length) {
      group.replaceChildren(...[...content].map((character) => {
        const digit = document.createElement('span');
        digit.className = 'digit';
        digit.textContent = character;
        return digit;
      }));
    }
    [...group.children].forEach((digit, i) => {
      if (digit.textContent !== content[i]) {
        digit.textContent = content[i];
        if (!reducedMotion.matches && id === 'release-clock') {
          digit.classList.remove('changed');
          requestAnimationFrame(() => digit.classList.add('changed'));
        }
      }
    });
  }
  // Timers are deliberately not live regions: screen readers should not announce every second.
  clock.setAttribute('aria-label', milliseconds === null ? `${label}: date not announced`
    : `${label}: ${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds`);
}

function renderMetadata() {
  const now = Date.now();
  const { latest, target, targetStatus, lts, ltsPatch } = getReleaseState(calendar, now);
  const confirmed = targetStatus === 'released';
  write('target-eyebrow', confirmed ? 'DuckDB 2.0 released' : 'Next major release');
  const badge = element('target-badge');
  const badgeText = { released: 'Released', unannounced: 'Date pending', countdown: 'On the way', 'release-day': 'Release day', awaiting: 'Awaiting release' }[targetStatus];
  badge.replaceChildren(document.createElement('span'), document.createTextNode(badgeText));
  write('target-date', target ? formatDate(target.date, 'long') : 'Date to be announced');
  element('tentative-label').hidden = confirmed || !target;
  const message = targetStatus === 'release-day' ? 'Today is the planned day. Waiting for the official release.'
    : targetStatus === 'awaiting' ? 'The planned date has passed. Waiting for the official release.'
    : confirmed ? 'DuckDB 2.0 has arrived. Counting the time since release.'
    : targetStatus === 'unannounced' ? 'The next chapter is coming. No date is listed yet.' : '';
  element('target-message').hidden = !message;
  write('target-message', message);
  const download = element<HTMLAnchorElement>('calendar-download');
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = undefined;
  download.hidden = !target;
  if (target && !confirmed) {
    downloadURL = URL.createObjectURL(new Blob([makeCalendarEvent(target, calendar.fetchedAt)], { type: 'text/calendar;charset=utf-8' }));
    download.href = downloadURL;
    download.download = 'duckdb-2.0.ics';
    download.textContent = 'Add to calendar ↗';
  } else if (target) {
    download.href = target.url;
    download.removeAttribute('download');
    download.textContent = 'Read the release notes ↗';
  }
  write('latest-version', latest ? `v${latest.version}` : 'Not available');
  write('latest-codename', latest?.codename || 'Patch release');
  setDate('latest-date', latest?.date);
  element<HTMLAnchorElement>('latest-link').href = latest?.url ?? CALENDAR_URL;
  write('lts-version', lts ? `v${releaseLine(lts.version)} LTS` : 'No LTS listed');
  write('lts-codename', lts?.codename ?? '');
  setDate('lts-end', lts?.endOfLife);
  write('lts-patch-note', ltsPatch ? `The latest LTS patch is v${ltsPatch.version}.` : '');
  displayedStatus = targetStatus;
  displayedDay = new Date(now).toISOString().slice(0, 10);
  renderLedger();
  renderSourceStatus();
}

function tick() {
  const now = Date.now();
  const { latest, target, targetStatus, lts } = getReleaseState(calendar, now);
  if (displayedDay !== new Date(now).toISOString().slice(0, 10) || displayedStatus !== targetStatus) renderMetadata();
  const wallTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(now);
  write('wall-clock', `${wallTime} UTC`);
  element<HTMLTimeElement>('wall-clock').dateTime = new Date(now).toISOString();
  const remaining = target ? timestamp(target.date) - now : null;
  renderClock('release-clock', remaining === null ? null : targetStatus === 'released' ? -remaining : Math.max(0, remaining), targetStatus === 'released' ? 'Time since DuckDB 2.0 release' : 'Time to planned DuckDB 2.0 release date');
  renderClock('latest-clock', latest ? now - timestamp(latest.date) : null, 'Time since the latest release');
  const ltsRemaining = lts?.endOfLife ? timestamp(lts.endOfLife) - now : null;
  renderClock('lts-clock', ltsRemaining === null ? null : Math.max(0, ltsRemaining), 'LTS community support remaining');
  write('lts-status', ltsRemaining === null ? 'Unknown' : ltsRemaining <= 0 ? 'Support ended' : 'Remaining');
  write('lts-title', ltsRemaining !== null && ltsRemaining <= 0 ? 'LTS support ended.' : 'LTS support remaining.');
  const percentage = lts?.endOfLife ? remainingFraction(lts.date, lts.endOfLife, now) * 100 : 0;
  element('support-fill').style.width = `${percentage}%`;
  element('support-meter').setAttribute('aria-valuenow', percentage.toFixed(1));
  element('support-meter').setAttribute('aria-valuetext', ltsRemaining === null ? 'Support end date not announced' : `${percentage.toFixed(1)}% of the support window remaining`);
  document.querySelector<SVGCircleElement>('[data-support-ring]')!.style.strokeDasharray = `${percentage} 100`;
  document.querySelector<SVGGElement>('[data-second-hand]')!.setAttribute('transform', `rotate(${new Date(now).getUTCSeconds() * 6} 50 50)`);
  updateLedgerAges(now);
}

function updateLedgerAges(now = Date.now()) {
  document.querySelectorAll<HTMLElement>('[data-release-date]').forEach((cell) => {
    const timing = releaseTiming(cell.dataset.releaseDate!, cell.dataset.planned === 'true', now);
    if (cell.textContent !== timing.text) {
      cell.textContent = timing.text;
      cell.title = timing.label;
      cell.setAttribute('aria-label', timing.label);
    }
  });
}

function renderLedger() {
  const now = Date.now();
  const released = calendar.releases.filter((r) => timestamp(r.date) <= now);
  const groups = getLedgerGroups(calendar, filter, now);
  const table = element<HTMLTableElement>('release-table');
  write('release-age-heading', filter === 'upcoming' ? 'Timing' : 'Age');
  write('ledger-description', {
    recent: 'The latest two release lines, with every patch.',
    upcoming: 'Announced releases, grouped by minor version.',
    lts: 'Long-term support releases, grouped by minor version.',
  }[filter]);
  table.querySelectorAll('tbody').forEach((body) => body.remove());
  if (!groups.length) {
    const body = document.createElement('tbody');
    table.append(body);
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'empty-table';
    cell.textContent = filter === 'upcoming' ? 'No upcoming release dates are currently announced.' : 'No releases listed in this category.';
    row.append(cell);
    body.append(row);
    return;
  }
  for (const group of groups) {
    const body = document.createElement('tbody');
    body.className = 'release-group';
    body.dataset.releaseLine = group.line;
    const groupRow = document.createElement('tr');
    groupRow.className = 'release-group-heading';
    const groupCell = document.createElement('th');
    groupCell.scope = 'rowgroup';
    groupCell.colSpan = 6;
    const groupHeading = document.createElement('div');
    groupHeading.className = 'branch-heading';
    const title = document.createElement('strong');
    title.textContent = `DuckDB ${group.line}`;
    groupHeading.append(title);
    if (group.codename) {
      const codename = document.createElement('span');
      codename.className = 'branch-codename';
      codename.textContent = group.codename;
      groupHeading.append(codename);
    }
    if (group.lts) {
      const lts = document.createElement('span');
      lts.className = 'branch-lts';
      lts.textContent = 'LTS';
      groupHeading.append(lts);
    }
    const count = document.createElement('span');
    count.className = 'branch-count';
    count.textContent = `${group.releases.length} ${group.releases.length === 1 ? 'release' : 'releases'}`;
    groupHeading.append(count);
    groupCell.append(groupHeading);
    groupRow.append(groupCell);
    body.append(groupRow);
    table.append(body);
    for (const release of group.releases) {
      const row = document.createElement('tr');
      row.className = 'release-row';
      const heading = document.createElement('th');
      heading.scope = 'row';
      const version = document.createElement('span');
      version.textContent = release.version;
      const product = document.createElement('span');
      product.className = 'release-product';
      product.textContent = 'DuckDB ';
      heading.append(product, version);
      const dateCell = document.createElement('td');
      const date = document.createElement('time');
      date.dateTime = release.date;
      date.textContent = formatDate(release.date);
      dateCell.append(date);
      const ageCell = document.createElement('td');
      ageCell.className = 'release-age';
      ageCell.dataset.releaseDate = release.date;
      ageCell.dataset.planned = String(filter === 'upcoming');
      const interval = releaseInterval(release, calendar, filter === 'upcoming');
      const intervalCell = document.createElement('td');
      intervalCell.className = 'release-interval';
      intervalCell.textContent = interval.text;
      intervalCell.title = interval.label;
      intervalCell.setAttribute('aria-label', interval.label);
      const statusCell = document.createElement('td');
      const status = document.createElement('span');
      const lineEnd = released.find((r) => releaseLine(r.version) === releaseLine(release.version) && r.endOfLife)?.endOfLife;
      const ended = !!lineEnd && timestamp(lineEnd) <= now;
      status.className = `table-status ${filter === 'upcoming' ? 'planned' : filter === 'lts' && ended ? 'ended' : ''}`;
      status.textContent = filter === 'upcoming' ? timestamp(release.date) + DAY <= now ? 'Awaiting release' : 'Planned'
        : filter === 'lts' ? ended ? 'Support ended' : lineEnd ? 'Supported LTS' : 'LTS' : 'Released';
      statusCell.append(status);
      const linkCell = document.createElement('td');
      const link = document.createElement('a');
      link.href = release.url;
      link.textContent = '↗';
      link.setAttribute('aria-label', `DuckDB ${release.version} ${filter === 'upcoming' ? 'calendar details' : 'release notes'}`);
      linkCell.append(link);
      row.append(heading, dateCell, ageCell, intervalCell, statusCell, linkCell);
      body.append(row);
    }
  }
  updateLedgerAges(now);
}

function renderSourceStatus() {
  const age = Math.max(0, Date.now() - Date.parse(calendar.fetchedAt));
  const stale = sourceUnavailable || calendar.sourceStatus !== 'live' || age > 36 * 60 * 60 * 1000;
  document.querySelector('.source-status')!.classList.toggle('stale', stale);
  write('source-label', sourceUnavailable ? 'Source unavailable · saved dates' : stale ? 'Saved calendar snapshot' : 'Official calendar connected');
  const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(calendar.fetchedAt));
  write('source-checked', `Checked ${formatted} UTC${age > 36 * 60 * 60 * 1000 ? ` · ${Math.floor(age / DAY)} days old` : ''}`);
}

function validCalendar(value: unknown): value is Calendar {
  if (!value || typeof value !== 'object') return false;
  const data = value as Calendar;
  const validRelease = (release: Release) => release && typeof release.version === 'string' && /^\d+\.\d+\.\d+$/.test(release.version)
    && typeof release.date === 'string' && isDate(release.date) && typeof release.lts === 'boolean'
    && (release.endOfLife === null || typeof release.endOfLife === 'string' && isDate(release.endOfLife))
    && (release.codename === null || typeof release.codename === 'string')
    && typeof release.url === 'string' && /^https:\/\/(?:www\.)?(?:duckdb\.org|github\.com)\//.test(release.url);
  return data.source === CALENDAR_URL && typeof data.fetchedAt === 'string' && Number.isFinite(Date.parse(data.fetchedAt))
    && ['live', 'snapshot'].includes(data.sourceStatus ?? '')
    && Array.isArray(data.releases) && data.releases.length > 0 && data.releases.every(validRelease)
    && Array.isArray(data.upcoming) && data.upcoming.every(validRelease);
}

async function refresh() {
  if (fetching) return;
  fetching = true;
  const button = element<HTMLButtonElement>('refresh-source');
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const response = await fetch('/api/releases', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Source unavailable');
    const data: unknown = await response.json();
    if (!validCalendar(data)) throw new Error('Invalid calendar response');
    // An outage fallback must never overwrite newer data already in this tab.
    if (Date.parse(data.fetchedAt) >= Date.parse(calendar.fetchedAt)) calendar = data;
    sourceUnavailable = data.sourceStatus === 'snapshot';
    renderMetadata();
    tick();
  } catch {
    sourceUnavailable = true;
    renderSourceStatus();
  } finally {
    fetching = false;
    button.disabled = false;
    button.textContent = 'Refresh source ↻';
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter as LedgerFilter;
    document.querySelectorAll('[data-filter]').forEach((control) => control.setAttribute('aria-pressed', String(control === button)));
    renderLedger();
  });
});

function setFocus(active: boolean) {
  document.body.classList.toggle('focus-mode', active);
  const button = element('focus-toggle');
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Exit focus mode' : 'Enter focus mode');
  button.title = active ? 'Exit focus mode (Escape)' : 'Focus mode';
  if (active) window.scrollTo({ top: 0, behavior: 'instant' });
}
element('focus-toggle').addEventListener('click', () => setFocus(!document.body.classList.contains('focus-mode')));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setFocus(false); });
element('refresh-source').addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    tick();
    renderSourceStatus();
    if (Date.now() - Date.parse(calendar.fetchedAt) > 60 * 60 * 1000) void refresh();
  }
});
renderMetadata();
tick();
setInterval(() => { if (!document.hidden) tick(); }, 1000);
setInterval(() => { if (!document.hidden) void refresh(); }, 60 * 60 * 1000);
void refresh();
