// Live-preview route (KTD7, U7). A local HTTP server stands in for the CMS, so the tests
// assert at the network boundary what reaches Payload and with which credentials.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signPreviewToken } from '@repo/shared/preview-token';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import PreviewPage from '../src/pages/preview/[...target].astro';
import { previewHeaders } from '../src/lib/preview';

interface Recorded {
  method: string;
  url: string;
  authorization?: string;
  override?: string;
  body?: any;
}

const SECRET = 'preview-test-secret';
const KEY = 'preview-test-key';
let server: Server;
let calls: Recorded[] = [];
let failPreview = false;
let origin = '';

const profileDoc = { id: 1, name: 'Ada', role: 'Fotografa', bio: 'Bio', clients: [{ name: 'ACME' }], contact: {} };
const projectDoc = {
  id: 7,
  slug: 'saved',
  title: 'Saved title',
  client: 'Client',
  featured: false,
  items: [],
  externalLink: { label: 'Saved link', href: 'https://example.com/' },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://cms');
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({
        method: req.method!,
        url: url.pathname + url.search,
        authorization: req.headers.authorization,
        override: req.headers['x-payload-http-method-override'] as string | undefined,
        body,
      });
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (failPreview && req.headers.authorization) return send(500, { errors: [] });
      // The real endpoint answers a method-override POST with the posted data merged in.
      if (url.pathname === '/api/projects/7') return send(200, body ? body.data : projectDoc);
      if (url.pathname === '/api/globals/profile') return send(200, body ? body.data : profileDoc);
      if (url.pathname === '/api/projects') return send(200, { docs: [] });
      send(404, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.CMS_URL = origin;
  process.env.PREVIEW_SECRET = SECRET;
  process.env.PREVIEW_API_KEY = KEY;
});
afterAll(() => server.close());
beforeEach(() => {
  calls = [];
  failPreview = false;
});

const token = (target: string, locale = 'it', now = Date.now()) => signPreviewToken({ secret: SECRET, target, locale, ttlSeconds: 7200, now });

async function call(target: string, { method = 'GET', tok, body }: { method?: string; tok?: string | null; body?: unknown } = {}) {
  const url = new URL(`http://localhost:4321/preview/${target}`);
  if (tok === undefined) url.searchParams.set('token', await token(target));
  else if (tok) url.searchParams.set('token', tok);
  const request = new Request(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await (await AstroContainer.create()).renderToResponse(PreviewPage, { request, params: { target } });
  return { response, html: await response.text() };
}

const withKey = () => calls.filter((c) => c.authorization);

describe('preview GET', () => {
  it('returns 401 without a token and never reaches Payload', async () => {
    const { response } = await call('projects/7', { tok: null });
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('returns 401 for a tampered, expired or other-target token and never uses the preview key', async () => {
    const good = await token('projects/7');
    const expired = await token('projects/7', 'it', Date.now() - 7201 * 1000);
    for (const tok of [`${good}x`, expired, await token('projects/8'), await token('globals/profile')]) {
      expect((await call('projects/7', { tok })).response.status).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it('returns 404 for an unknown target and never reaches Payload', async () => {
    expect((await call('projects/abc', { tok: 'whatever' })).response.status).toBe(404);
    expect((await call('globals/users', { tok: 'whatever' })).response.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('renders the draft read with the preview key, in the language of the token', async () => {
    const { response, html } = await call('projects/7', { tok: await token('projects/7', 'en') });
    expect(response.status).toBe(200);
    expect(html).toContain('Saved title');
    const draft = withKey();
    expect(draft).toHaveLength(1);
    expect(draft[0].authorization).toBe(`users API-Key ${KEY}`);
    expect(draft[0].url).toContain('/api/projects/7');
    expect(draft[0].url).toContain('draft=true');
    expect(draft[0].url).toContain('locale=en');
  });

  it('carries no CDN cache headers and allows only the CMS origin to frame it', async () => {
    for (const result of [await call('projects/7'), await call('projects/7', { tok: null })]) {
      const headers = result.response.headers;
      expect(headers.get('cache-control')).toMatch(/no-store/);
      expect(headers.get('cache-control')).not.toMatch(/s-maxage|stale-while-revalidate/);
      expect(headers.get('cdn-cache-control')).toBe('no-store');
      expect(headers.get('vercel-cdn-cache-control')).toBe('no-store');
      expect(headers.get('content-security-policy')).toBe(`frame-ancestors ${origin}`);
      expect(headers.has('vercel-cache-tag')).toBe(false);
    }
  });

  it('answers 502 when the CMS fails, so the frame shows its paused state instead of a stale page', async () => {
    failPreview = true;
    expect((await call('projects/7')).response.status).toBe(502);
  });
});

describe('preview POST', () => {
  it('asks Payload to merge the posted data at render depth, with the token locale', async () => {
    const { response, html } = await call('projects/7', { method: 'POST', body: { data: { ...projectDoc, title: 'Typed title' } } });
    expect(response.status).toBe(200);
    expect(html).toContain('Typed title');
    const [merge] = withKey();
    expect(merge.method).toBe('POST');
    expect(merge.url).toBe('/api/projects/7');
    expect(merge.override).toBe('GET');
    expect(merge.body).toMatchObject({ depth: 2, locale: 'it', flattenLocales: false, data: { title: 'Typed title' } });
    expect(merge.body.draft).toBeUndefined();
  });

  it('renders a title containing a script tag escaped', async () => {
    const title = '<script>alert(1)</script>';
    const { html } = await call('projects/7', { method: 'POST', body: { data: { ...projectDoc, title } } });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain(title);
  });

  it('renders a javascript: external link without an executable href', async () => {
    const { html } = await call('projects/7', {
      method: 'POST',
      body: { data: { ...projectDoc, externalLink: { label: 'Click', href: 'javascript:alert(1)' } } },
    });
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain('>Click<');
  });

  it('still renders when the token is about to expire', async () => {
    const tok = await token('projects/7', 'it', Date.now() - (7200 - 2) * 1000);
    const { response, html } = await call('projects/7', { method: 'POST', tok, body: { data: { ...projectDoc, title: 'Late edit' } } });
    expect(response.status).toBe(200);
    expect(html).toContain('Late edit');
  });

  it('refuses a POST with an expired token before reaching Payload', async () => {
    const tok = await token('projects/7', 'it', Date.now() - 7201 * 1000);
    expect((await call('projects/7', { method: 'POST', tok, body: { data: projectDoc } })).response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('rejects a body that is not an object of form data', async () => {
    expect((await call('projects/7', { method: 'POST', body: { data: 'nope' } })).response.status).toBe(400);
    expect(withKey()).toEqual([]);
  });

  it('previews the homepage with the edited profile when the target is the profile global', async () => {
    const { response, html } = await call('globals/profile', {
      method: 'POST',
      body: { data: { ...profileDoc, name: 'Edited Name', clients: [{ name: 'New Client' }] } },
    });
    expect(response.status).toBe(200);
    expect(html).toContain('Edited Name');
    expect(html).toContain('New Client');
    const [merge] = withKey();
    expect(merge.url).toBe('/api/globals/profile');
    expect(merge.override).toBe('GET');
    // The page is the homepage: its featured projects come from the public API, without the key.
    expect(calls.some((c) => c.url.startsWith('/api/projects?') && !c.authorization)).toBe(true);
  });
});

describe('preview headers helper', () => {
  it('only needs the origin of the CMS URL', () => {
    expect(previewHeaders('http://localhost:3000/admin')['content-security-policy']).toBe('frame-ancestors http://localhost:3000');
  });
});
