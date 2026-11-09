import type { Profile, Project } from '@repo/shared';
import type { Locale } from './i18n';
import { mapProfile, mapProject, type MapContext, type ProfileView, type ProjectView } from './mappers';

// Thin read-only client for the public Payload REST API. Anonymous requests only see
// published documents, and `locale` falls back to Italian when a translation is missing.

// Deep enough to populate items -> video -> poster/webm and the profile hero -> poster.
const DEPTH = '2';

const defaultContext = (): MapContext => ({
  cmsUrl: process.env.CMS_URL ?? import.meta.env.CMS_URL ?? 'http://localhost:3000',
});

async function get<T>(path: string, params: Record<string, string>, { cmsUrl }: MapContext): Promise<T> {
  const url = new URL(path, cmsUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CMS request failed: ${response.status} ${url.pathname}`);
  return (await response.json()) as T;
}

export async function getProjects(
  locale: Locale,
  { featured = false }: { featured?: boolean } = {},
  ctx: MapContext = defaultContext(),
): Promise<ProjectView[]> {
  const { docs } = await get<{ docs: Project[] }>(
    '/api/projects',
    { locale, depth: DEPTH, limit: '100', sort: 'order', ...(featured ? { 'where[featured][equals]': 'true' } : {}) },
    ctx,
  );
  return docs.map((doc) => mapProject(doc, ctx));
}

export async function getProject(slug: string, locale: Locale, ctx: MapContext = defaultContext()): Promise<ProjectView | null> {
  const { docs } = await get<{ docs: Project[] }>(
    '/api/projects',
    { locale, depth: DEPTH, limit: '1', 'where[slug][equals]': slug },
    ctx,
  );
  return docs[0] ? mapProject(docs[0], ctx) : null;
}

export async function getProfile(locale: Locale, ctx: MapContext = defaultContext()): Promise<ProfileView> {
  return mapProfile(await get<Profile>('/api/globals/profile', { locale, depth: DEPTH }, ctx), ctx);
}
