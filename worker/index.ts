import { fetchCalendar } from '../src/lib/calendar-source';
import snapshot from '../src/data/calendar.json';

interface Env { ASSETS: Fetcher }

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/releases') return env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const key = new Request(`${url.origin}/api/releases`);
    const cache = caches.default;
    const cached = await cache.match(key);
    let response = cached;
    if (!response) {
      try {
        const calendar = await fetchCalendar();
        response = Response.json({ ...calendar, sourceStatus: 'live' }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
        context.waitUntil(cache.put(key, response.clone()));
      } catch {
        response = Response.json({ ...snapshot, sourceStatus: 'snapshot' }, { headers: { 'Cache-Control': 'public, max-age=60' } });
      }
    }
    return request.method === 'HEAD' ? new Response(null, response) : response;
  },
} satisfies ExportedHandler<Env>;
