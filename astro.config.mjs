import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Static output for every page. The single exception is /api/submit,
// which opts out with `export const prerender = false` and runs as a
// Vercel serverless function.
export default defineConfig({
  site: 'https://sovereignego.com',
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'never',
  build: { inlineStylesheets: 'never' },
});
