import type { Form, Profile, Project } from '@repo/shared';
import type { Locale } from './i18n';
import { mapContactForm, mapProfile, mapProject, type ContactFormView, type MapContext, type ProfileView, type ProjectView } from './mappers';

// Thin read-only client for the public Payload REST API. Anonymous requests only see
// published documents, and `locale` falls back to Italian when a translation is missing.

// Deep enough to populate items -> video -> poster/webm and the profile hero -> poster.
const DEPTH = '2';

/** Matches the slug the CMS seed gives the contact form. */
export const CONTACT_FORM_SLUG = 'contact';

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

/** The contact form, looked up by its stable slug. Null when the CMS has none (the page then shows the email card). */
export async function getContactForm(locale: Locale, ctx: MapContext = defaultContext()): Promise<ContactFormView | null> {
  const { docs } = await get<{ docs: Form[] }>(
    '/api/forms',
    { locale, depth: '0', limit: '1', 'where[slug][equals]': CONTACT_FORM_SLUG },
    ctx,
  );
  return docs[0] ? mapContactForm(docs[0]) : null;
}

// --- Live preview (KTD7) ---------------------------------------------------------------
// Drafts are read server-to-server with the read-only `preview` API-key user. The route
// verifies the preview token before calling any of this, so the key never serves anonymous
// requests directly.

const envVar = (name: string): string | undefined => process.env[name] ?? (import.meta.env as Record<string, string | undefined>)[name];

async function previewRequest<T>(path: string, params: Record<string, string>, body: unknown, { cmsUrl }: MapContext): Promise<T | null> {
  const key = envVar('PREVIEW_API_KEY');
  if (!key) throw new Error('PREVIEW_API_KEY is not set');
  const url = new URL(path, cmsUrl);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const bypass = envVar('VERCEL_AUTOMATION_BYPASS_SECRET');
  const response = await fetch(url, {
    // With a body, Payload merges it into the document (the find endpoint's `data` argument)
    // and populates relationships at the requested depth, exactly as for a saved draft.
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `users API-Key ${key}`,
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
      ...(body ? { 'content-type': 'application/json', 'x-payload-http-method-override': 'GET' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`CMS preview request failed: ${response.status} ${url.pathname}`);
  return (await response.json()) as T;
}

/** `data` is the admin's unsaved form state. Without it the saved draft is shown. */
export async function getPreviewProject(
  id: string,
  locale: Locale,
  data?: object,
  ctx: MapContext = defaultContext(),
): Promise<ProjectView | null> {
  const path = `/api/projects/${encodeURIComponent(id)}`;
  const doc = await previewRequest<Project>(
    path,
    data ? {} : { locale, depth: DEPTH, draft: 'true' },
    data && { data, depth: Number(DEPTH), locale, flattenLocales: false },
    ctx,
  );
  // A merged document carries no id (the form state has none).
  return doc ? mapProject({ ...doc, id: doc.id ?? (Number.isNaN(Number(id)) ? id : Number(id)) } as Project, ctx) : null;
}

export async function getPreviewProfile(locale: Locale, data?: object, ctx: MapContext = defaultContext()): Promise<ProfileView | null> {
  const doc = await previewRequest<Profile>(
    '/api/globals/profile',
    data ? {} : { locale, depth: DEPTH, draft: 'true' },
    data && { data, depth: Number(DEPTH), locale, flattenLocales: false },
    ctx,
  );
  return doc ? mapProfile(doc, ctx) : null;
}
