import { defineConfig } from 'astro/config';
import { fetchCalendar } from './src/lib/calendar-source.ts';

export default defineConfig({
  site: 'https://duckdb-release-clock.query.farm',
  output: 'static',
  compressHTML: false,
  devToolbar: { enabled: false },
  vite: {
    plugins: [{
      name: 'release-calendar-dev-api',
      configureServer(server) {
        server.middlewares.use('/api/releases', async (_request, response) => {
          try {
            const calendar = await fetchCalendar();
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ ...calendar, sourceStatus: 'live' }));
          } catch {
            response.statusCode = 503;
            response.end(JSON.stringify({ error: 'Calendar temporarily unavailable' }));
          }
        });
      },
    }],
  },
});
