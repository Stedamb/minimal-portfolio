import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import { cacheVercel } from '@astrojs/vercel/cache';

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
  vite: {
    plugins: [tailwindcss()],
  },
});
