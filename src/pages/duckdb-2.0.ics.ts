import type { APIRoute } from 'astro';
import snapshot from '../data/calendar.json';
import { makeCalendarEvent, TARGET_VERSION } from '../lib/releases';

export const GET: APIRoute = () => {
  const release = snapshot.upcoming.find((r) => r.version === TARGET_VERSION);
  if (!release) return new Response('No planned date is currently listed.', { status: 404 });
  return new Response(makeCalendarEvent(release, snapshot.fetchedAt), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
