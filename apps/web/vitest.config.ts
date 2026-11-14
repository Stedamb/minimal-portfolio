import { getViteConfig } from 'astro/config';

// getViteConfig lets tests render .astro components through the container API.
export default getViteConfig({
  test: { include: ['tests/**/*.test.ts'] },
} as never);
