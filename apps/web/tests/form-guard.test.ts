// Contact form guard (KTD11, R15, R16, U9). The guard talks to a stub CMS over real HTTP, so
// the rate limit is verified the way production holds it: state lives in the "CMS", never in
// the web process.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Contact from '../src/components/Contact.astro';
import { server as actions } from '../src/actions';
import {
  HONEYPOT_FIELD,
  LOCALE_FIELD,
  MIN_FILL_MS,
  RATE_LIMIT,
  TOKEN_FIELD,
  checkRenderToken,
  handleContact,
  hashIp,
  signRenderToken,
  type ContactEnv,
} from '../src/lib/form-guard';
import type { ProfileView } from '../src/lib/mappers';

const SECRET = 'test-contact-secret';
const KEY = 'test-submitter-key';

interface Stored {
  form: number;
  submissionData: { field: string; value: string }[];
  ipHash: string;
}

let cms: Server;
let cmsUrl: string;
let stored: Stored[];
let requests: { method: string; path: string; auth?: string }[];

const FORM = {
  id: 7,
  slug: 'contact',
  title: 'Contact',
  fields: [
    { blockType: 'text', name: 'name', label: 'Nome', required: true },
    { blockType: 'email', name: 'email', label: 'E-mail', required: true },
    { blockType: 'textarea', name: 'message', label: 'Messaggio', required: true },
  ],
  submitButtonLabel: 'Invia',
  confirmationType: 'message',
  confirmationMessage: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Grazie!' }] }] } },
};

beforeAll(async () => {
  cms = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://stub');
    requests.push({ method: req.method!, path: url.pathname, auth: req.headers.authorization });
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    };
    if (url.pathname === '/api/forms') return json(200, { docs: [FORM] });
    // The submitter key is the only credential the stub accepts for the two private routes.
    if (req.headers.authorization !== `users API-Key ${KEY}`) return json(403, { error: 'Forbidden' });
    if (url.pathname === '/api/contact-rate') {
      const hash = url.searchParams.get('ipHash');
      return json(200, { count: stored.filter((row) => row.ipHash === hash).length });
    }
    if (url.pathname === '/api/form-submissions' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      stored.push(JSON.parse(body));
      return json(201, { doc: { id: stored.length } });
    }
    return json(404, {});
  });
  await new Promise<void>((resolve) => cms.listen(0, '127.0.0.1', resolve));
  cmsUrl = `http://127.0.0.1:${(cms.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => cms.close(() => resolve())));

beforeEach(() => {
  stored = [];
  requests = [];
});

const env = (extra: Partial<ContactEnv> = {}): ContactEnv => ({ cmsUrl, secret: SECRET, submitterKey: KEY, ...extra });
const RENDERED_AT = 1_700_000_000_000;

const fill = (extra: Record<string, string> = {}, renderedAt = RENDERED_AT) => {
  const data = new FormData();
  const fields: Record<string, string> = {
    [LOCALE_FIELD]: 'it',
    [TOKEN_FIELD]: signRenderToken(SECRET, renderedAt),
    name: 'Ada',
    email: 'ada@example.com',
    message: 'Ciao!',
    ...extra,
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

const later = (ms: number) => ({ now: () => RENDERED_AT + ms });
const send = (data: FormData, ip = '203.0.113.10', ms = 10_000) => handleContact(data, { clientAddress: ip }, env(later(ms)));

describe('a valid submission', () => {
  it('creates exactly one submission with every field, the form id and the salted IP hash', async () => {
    expect(await send(fill())).toEqual({ status: 'sent' });
    expect(stored).toHaveLength(1);
    expect(stored[0].form).toBe(7);
    expect(stored[0].submissionData).toEqual([
      { field: 'name', value: 'Ada' },
      { field: 'email', value: 'ada@example.com' },
      { field: 'message', value: 'Ciao!' },
    ]);
    expect(stored[0].ipHash).toBe(hashIp('203.0.113.10', SECRET));
    expect(JSON.stringify(stored[0])).not.toContain('203.0.113.10');
  });

  it('writes with the submitter key', async () => {
    await send(fill());
    const post = requests.find((r) => r.method === 'POST');
    expect(post?.auth).toBe(`users API-Key ${KEY}`);
  });
});

describe('honeypot', () => {
  it('returns a success-looking response and stores nothing, without even calling the CMS', async () => {
    expect(await send(fill({ [HONEYPOT_FIELD]: 'http://spam.example' }))).toEqual({ status: 'sent' });
    expect(stored).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });
});

describe('render timestamp', () => {
  it('rejects a submission 2 s after render as too fast, and stores nothing', async () => {
    expect(await send(fill(), '203.0.113.10', 2_000)).toMatchObject({ status: 'rejected', reason: 'too_fast' });
    expect(stored).toHaveLength(0);
  });

  it('accepts one exactly at the minimum fill time', async () => {
    expect(await send(fill(), '203.0.113.10', MIN_FILL_MS)).toEqual({ status: 'sent' });
  });

  it('rejects a stale, a missing and a tampered token', async () => {
    expect(await send(fill(), '203.0.113.10', 25 * 60 * 60 * 1000)).toMatchObject({ reason: 'expired' });
    expect(await send(fill({ [TOKEN_FIELD]: '' }))).toMatchObject({ status: 'rejected', reason: 'expired' });
    const forged = `${RENDERED_AT - 60_000}.${signRenderToken(SECRET, RENDERED_AT).split('.')[1]}`;
    expect(await send(fill({ [TOKEN_FIELD]: forged }))).toMatchObject({ status: 'rejected' });
    expect(stored).toHaveLength(0);
  });

  it("does not verify a token signed with another secret", () => {
    expect(checkRenderToken(signRenderToken('other', RENDERED_AT), SECRET, RENDERED_AT + 10_000)).toBe('invalid');
  });
});

describe('rate limit', () => {
  it('rejects the sixth submission from one IP, with every call a separate invocation', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) expect(await send(fill())).toEqual({ status: 'sent' });
    expect(await send(fill())).toMatchObject({ status: 'rejected', reason: 'rate_limited' });
    expect(stored).toHaveLength(RATE_LIMIT);
  });

  it('counts per IP: another address is still accepted', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) await send(fill());
    expect(await send(fill(), '198.51.100.4')).toEqual({ status: 'sent' });
  });
});

describe('validation', () => {
  it('returns the missing fields and keeps the entered values', async () => {
    const result = await send(fill({ message: '   ', name: 'Ada L.' }));
    expect(result).toEqual({
      status: 'invalid',
      missing: ['message'],
      values: { name: 'Ada L.', email: 'ada@example.com', message: '' },
    });
    expect(stored).toHaveLength(0);
  });

  it('rejects a malformed e-mail and an oversized message', async () => {
    expect(await send(fill({ email: 'not-an-email' }))).toMatchObject({ status: 'invalid', missing: ['email'] });
    expect(await send(fill({ message: 'x'.repeat(5001) }))).toMatchObject({ status: 'invalid', missing: ['message'] });
  });

  it('fails closed without a secret or a submitter key', async () => {
    expect(await handleContact(fill(), { clientAddress: '1.1.1.1' }, env({ secret: '' }))).toMatchObject({ reason: 'failed' });
    expect(await handleContact(fill(), { clientAddress: '1.1.1.1' }, env({ submitterKey: '' }))).toMatchObject({ reason: 'failed' });
  });
});

describe('the Action', () => {
  const run = (data: FormData, headers: Record<string, string>, clientAddress: string) =>
    (actions.contact.orThrow as (this: unknown, input: FormData) => Promise<unknown>).call(
      {
        [Symbol.for('astro.actionAPIContext')]: true,
        clientAddress,
        request: new Request('http://localhost:4321/info', { method: 'POST', headers }),
      },
      data,
    );

  beforeAll(() => {
    process.env.CMS_URL = cmsUrl;
    process.env.CONTACT_FORM_SECRET = SECRET;
    process.env.SUBMITTER_API_KEY = KEY;
  });

  it('counts the address Astro reports, whatever x-forwarded-for says', async () => {
    const data = () => fill({}, Date.now() - 60_000);
    for (let i = 0; i < RATE_LIMIT; i++) {
      // A different spoofed address on every request must not reset the limit.
      expect(await run(data(), { 'x-forwarded-for': `10.0.0.${i}` }, '203.0.113.50')).toEqual({ status: 'sent' });
    }
    expect(await run(data(), { 'x-forwarded-for': '10.9.9.9' }, '203.0.113.50')).toMatchObject({ reason: 'rate_limited' });
    expect(new Set(stored.map((row) => row.ipHash))).toEqual(new Set([hashIp('203.0.113.50', SECRET)]));
  });
});

describe('Contact.astro with the CMS form', () => {
  const profile: ProfileView = {
    name: 'Ada', role: 'Fotografa', bio: 'Bio', clients: [], email: 'ada@example.com', emailHref: 'mailto:ada@example.com',
    phone: '+39 000', phoneHref: 'tel:+39000',
  };
  const form = {
    id: 7,
    fields: [
      { name: 'name', label: 'Nome', type: 'text' as const, required: true },
      { name: 'email', label: 'E-mail', type: 'email' as const, required: true },
      { name: 'message', label: 'Messaggio', type: 'textarea' as const, required: true },
    ],
    submitLabel: 'Invia',
    confirmation: 'Grazie!',
  };
  const render = async (props: Record<string, unknown>) => (await AstroContainer.create()).renderToString(Contact, { props: { profile, locale: 'it', ...props } });

  it('replaces the e-mail card with the form and keeps the phone card and the bio', async () => {
    const html = await render({ form, token: 'tok' });
    for (const label of ['Nome', 'E-mail', 'Messaggio', 'Invia']) expect(html).toContain(label);
    expect(html).toContain('action="?_action=contact"');
    expect(html).toContain('name="rendered" value="tok"');
    expect(html).toContain(`name="${HONEYPOT_FIELD}"`);
    expect(html).toContain('id="contact-sent"');
    expect(html).toContain('Grazie!');
    expect(html).not.toContain('mailto:');
    expect(html).toContain('tel:+39000');
    expect(html).toContain('Bio');
  });

  it('shows the entered values and a localized error after a rejected post without JavaScript', async () => {
    const html = await render({
      form,
      locale: 'en',
      result: { status: 'invalid', missing: ['message'], values: { name: 'Ada', email: 'ada@example.com', message: '' } },
    });
    expect(html).toContain('value="Ada"');
    expect(html).toContain('Please check this field.');
    expect(html).toMatch(/name="message"[^>]*aria-invalid="true"/);
  });

  it('falls back to the e-mail card without a form', async () => {
    const html = await render({ form: null });
    expect(html).toContain('mailto:ada@example.com');
    expect(html).not.toContain('contact-form');
  });
});
