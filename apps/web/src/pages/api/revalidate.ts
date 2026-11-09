import { timingSafeEqual } from 'node:crypto';
import { dangerouslyDeleteByTag } from '@vercel/functions';
import type { APIRoute } from 'astro';

// Called by the CMS purge hooks after a publish (KTD6). Deletes by tag rather than marking
// stale (the Astro provider's `invalidate` only marks stale), so the first request after a
// publish already renders the new page. Off Vercel the purge is a no-op and only logs.

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function authorized(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET || import.meta.env.REVALIDATE_SECRET;
  const header = request.headers.get('authorization');
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const POST: APIRoute = async ({ request }) => {
  if (!authorized(request)) return json({ error: 'Unauthorized' }, 401);

  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = body?.tags;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string' && tag.length > 0)) {
    return json({ error: 'Expected { tags: string[] }' }, 400);
  }

  await dangerouslyDeleteByTag(tags);
  console.info(`[revalidate] purged ${tags.join(', ')}`);
  return json({ tags }, 200);
};
