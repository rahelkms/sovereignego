import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// Static output for every page. The single exception is /api/submit,
// which opts out with `export const prerender = false` and runs as a
// Vercel serverless function.
export default defineConfig({
  site: 'https://sovereignego.com',
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap({ filter: (p) => !p.includes('/submitted') && !p.includes('/declined') })],
  trailingSlash: 'never',
  build: { inlineStylesheets: 'never' },
  // The same-site check for /api/submit is implemented in the route itself
  // (Origin vs. x-forwarded-host). Astro's version compares against
  // request.url, which differs from the public host behind Vercel's proxy
  // and rejected every real submission with "Cross-site POST form
  // submissions are forbidden".
  security: { checkOrigin: false },
});
