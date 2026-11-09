import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import { cacheVercel } from '@astrojs/vercel/cache';

// Dev port follows WEB_URL (set by the root scripts), 4321 otherwise.
const webPort = Number(new URL(process.env.WEB_URL ?? 'http://localhost:4321').port) || 4321;

// https://astro.build/config
export default defineConfig({
  // Every page is rendered on demand from Payload content (KTD5).
  output: 'server',
  adapter: vercel(),
  // Route cache on Vercel's CDN, tagged per entity and purged on publish (KTD5, KTD6).
  cache: { provider: cacheVercel() },
  // Italian at the root, English under /en (KTD13).
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  server: { port: webPort },
  vite: {
    plugins: [tailwindcss()],
  },
});
