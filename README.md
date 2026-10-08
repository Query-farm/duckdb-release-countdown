# DuckDB Release Watch

A small Astro site at [duckdb-release-clock.query.farm](https://duckdb-release-clock.query.farm), taking its typography, paper palette, and Strata Sun mark from the Query.Farm site. It pairs Petrona serif headings with Bricolage Grotesque for body copy, labels, and numbers. Both are Google Fonts served locally through Fontsource, with optical sizing and tabular figures where needed. There is no client framework or third-party analytics.

## Development

Use Node 22.12+ (Node 24+ recommended).

```sh
npm ci
npm run dev
```

Astro prints the local URL; it chooses another port if 4321 is occupied. The development server also serves `/api/releases`. With Astro 7, `npx astro dev status`, `npx astro dev logs`, and `npx astro dev stop` manage a background server.

## The clocks

- **DuckDB 2.0:** counts down to its planned date. At zero it shows “Release day,” then “Awaiting release.” Only an entry in the past-releases table confirms a release, after which the clock counts up.
- **Last release:** counts from the newest published date across all release lines, including patches. Versions break same-day ties.
- **LTS:** uses the newest released LTS line with an explicit end-of-life date, and shows its latest patch. It clamps to zero and says “Support ended” when that deadline passes.

All date-only entries use **00:00 UTC**, including the LTS end date. This is a display convention, not an announced launch hour. Tentative dates and the timing convention are visible on the page. The `.ics` download is a one-time all-day reminder, not a subscribed calendar.

The release ledger groups versions by their major.minor branch, newest branch first. Recent shows the full history of the latest two branches, with patches newest first; Upcoming and LTS show all matching branches. Each group has its codename and release count. Announced patch releases appear in Upcoming without a separate countdown card.

The ledger shows elapsed days and hours in its **Age** column for recent and LTS releases. Upcoming releases show time remaining in a **Timing** column, switching to “Today” or an overdue duration as appropriate. These values update while the page is open and use the same UTC convention as the clocks.

The **Interval** column compares each release date with the preceding version in the same major.minor branch, in whole days. Tooltips identify the earlier version and date. Planned releases can use earlier planned versions as their predecessor; their intervals have a `~` prefix. A dash means no earlier dated release is listed in that branch. Intervals do not mix LTS and regular release lines.

## Calendar source and freshness

The authoritative source is [DuckDB’s release calendar](https://duckdb.org/release_calendar). The implementation parses its upcoming and past release tables, including explicit support deadlines. The downloadable CSV is deliberately not used because it can lag behind the rendered calendar.

`npm run refresh` validates and atomically updates `src/data/calendar.json`. It runs before every production build. An unavailable or structurally changed source preserves the last snapshot and prints a warning. Set `REQUIRE_FRESH_CALENDAR=1` to make that condition fail a build.

In production, the Cloudflare Worker serves `/api/releases`, caching successful calendar fetches for an hour. On an upstream failure it returns the bundled snapshot with `sourceStatus: "snapshot"` and a short cache lifetime. The browser fetches on opening the page, hourly while visible, and when returning to an old tab. It never replaces newer in-memory dates with an older fallback. The source status and original check time are shown in the footer; an unavailable source is labeled explicitly.

The parser fails closed on unexpected rows and dates. If DuckDB changes its table structure, update `src/lib/calendar-source.ts` and its fixture tests. The 2.0 codename is editorial metadata from [DuckDB’s v2.0 preview announcement](https://duckdb.org/2026/09/02/try-duckdb-20-alpha).

## Verify

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser tests build the site and start a local Cloudflare Worker on port 8790. They cover desktop and mobile layout, ticking clocks, filters, release intervals, minor-version grouping, focus mode, calendar downloads, source failure, date changes, release confirmation, and support expiry. Dates are pinned to a fixture so future source updates do not change expected results. To use an existing server instead, set `TEST_BASE_URL`.

`npm run generate:social` regenerates the static social preview using local fonts and Playwright; it contains no countdown that would become stale.

## Cloudflare hosting

This project uses **Cloudflare Workers with Static Assets**. Astro builds static HTML into `dist/`; the small Worker handles only the live calendar API. It needs no database, KV namespace, API keys, or application secrets.

```sh
npm run build
npm run preview:cloudflare
npx wrangler deploy --dry-run
```

When ready to publish, authenticate Wrangler to the account that owns the `query.farm` zone, then run:

```sh
npx wrangler login
npm run deploy
```

`wrangler.jsonc` declares `duckdb-release-clock.query.farm` as a custom domain. Deployment creates or updates that Worker/domain binding. Building or previewing does not publish the site. To deploy an already verified build without refreshing the bundled calendar again, run `npx wrangler deploy` directly after `npm run build`.

For Cloudflare Git builds, use `npm run build` as the build command and `npx wrangler deploy` as the deploy command. Plain static hosting can display the bundled snapshot, but needs the Worker API for live source updates.

Query.Farm and DuckDB marks are used as project identifiers. This is an independent Query.Farm community site, not an official DuckDB service. Font licenses are distributed by their Fontsource packages.
