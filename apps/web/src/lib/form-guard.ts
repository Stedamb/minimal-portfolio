import { createHmac, timingSafeEqual } from 'node:crypto';
import { CMS_TIMEOUT_MS, getContactForm } from './payload';
import { defaultLocale, isLocale, type Locale } from './i18n';
import { cmsUrl, env } from './env';
import type { ContactFieldView, MapContext } from './mappers';

// Spam and abuse checks for the contact form. The browser never talks to Payload:
// the Astro Action calls handleContact, which validates, checks the honeypot, the signed render
// timestamp and the per-IP rate limit, then creates the submission with the `submitter` key.

export const HONEYPOT_FIELD = 'website';
export const TOKEN_FIELD = 'rendered';
export const LOCALE_FIELD = 'locale';

export const MIN_FILL_MS = 3_000;
// A form left open in a tab for a day is stale; reloading gets a fresh timestamp.
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RATE_LIMIT = 5;
export const RATE_WINDOW_SECONDS = 10 * 60;

const MAX_LENGTH = { text: 200, email: 254, textarea: 5000 } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactEnv extends MapContext {
  secret: string;
  submitterKey: string;
  bypass?: string;
  now?: () => number;
}

export const contactEnv = (): ContactEnv => ({
  cmsUrl: cmsUrl(),
  secret: env('CONTACT_FORM_SECRET') ?? '',
  submitterKey: env('SUBMITTER_API_KEY') ?? '',
  bypass: env('VERCEL_AUTOMATION_BYPASS_SECRET') || undefined,
});

// One secret, two purposes: the label keeps a timestamp signature from doubling as an IP hash.
const mac = (secret: string, label: string, value: string) => createHmac('sha256', secret).update(`${label}:${value}`).digest('hex');

/** `<ms>.<hmac>`: when the form was rendered, signed so a bot can't backdate it. */
export const signRenderToken = (secret: string, now = Date.now()): string => `${now}.${mac(secret, 'render', String(now))}`;

export type TokenCheck = 'ok' | 'too_fast' | 'expired' | 'invalid';

export function checkRenderToken(token: string, secret: string, now = Date.now()): TokenCheck {
  const [stamp = '', signature = ''] = token.split('.');
  const expected = Buffer.from(mac(secret, 'render', stamp));
  const received = Buffer.from(signature);
  if (!secret || !/^\d{1,15}$/.test(stamp) || expected.length !== received.length || !timingSafeEqual(expected, received)) return 'invalid';
  const age = now - Number(stamp);
  if (age < MIN_FILL_MS) return 'too_fast';
  return age > MAX_AGE_MS ? 'expired' : 'ok';
}

/** Salted hash of the client IP: what the CMS stores and counts, never the address. */
export const hashIp = (ip: string, secret: string): string => mac(secret, 'ip', ip);

export type ContactResult =
  | { status: 'sent' }
  | { status: 'invalid'; missing: string[]; values: Record<string, string> }
  | { status: 'rejected'; reason: 'too_fast' | 'expired' | 'rate_limited' | 'failed'; values: Record<string, string> };

const invalidField = (field: ContactFieldView, value: string): boolean =>
  (field.required && !value) || value.length > MAX_LENGTH[field.type] || (field.type === 'email' && Boolean(value) && !EMAIL.test(value));

async function cms(path: string, env: ContactEnv, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, env.cmsUrl), {
    signal: AbortSignal.timeout(CMS_TIMEOUT_MS),
    ...init,
    headers: {
      authorization: `users API-Key ${env.submitterKey}`,
      ...(env.bypass ? { 'x-vercel-protection-bypass': env.bypass } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
}

/**
 * The Action's logic. `clientAddress` is Astro's (set by the Vercel adapter); request headers
 * are deliberately not an input, so a spoofed x-forwarded-for changes nothing.
 */
export async function handleContact(
  formData: FormData,
  { clientAddress }: { clientAddress: string },
  env: ContactEnv = contactEnv(),
): Promise<ContactResult> {
  // A bot that fills the hidden field is told it worked and nothing is stored.
  if (String(formData.get(HONEYPOT_FIELD) ?? '').trim()) return { status: 'sent' };

  const requested = String(formData.get(LOCALE_FIELD) ?? '');
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  let form;
  try {
    form = await getContactForm(locale, env);
  } catch {
    form = null;
  }
  if (!form || !env.secret || !env.submitterKey) return { status: 'rejected', reason: 'failed', values: {} };

  const values = Object.fromEntries(form.fields.map((field) => [field.name, text(field.name)]));
  const missing = form.fields.filter((field) => invalidField(field, values[field.name])).map((field) => field.name);
  if (missing.length) return { status: 'invalid', missing, values };

  const token = checkRenderToken(text(TOKEN_FIELD), env.secret, env.now?.() ?? Date.now());
  if (token !== 'ok') return { status: 'rejected', reason: token === 'too_fast' ? 'too_fast' : 'expired', values };

  const ipHash = hashIp(clientAddress, env.secret);
  try {
    // The count lives in the CMS, so it holds across serverless instances.
    const counted = await cms(`/api/contact-rate?ipHash=${ipHash}&windowSeconds=${RATE_WINDOW_SECONDS}`, env);
    if (!counted.ok) return { status: 'rejected', reason: 'failed', values };
    if (((await counted.json()) as { count: number }).count >= RATE_LIMIT) return { status: 'rejected', reason: 'rate_limited', values };

    const created = await cms('/api/form-submissions', env, {
      method: 'POST',
      body: JSON.stringify({
        form: form.id,
        submissionData: form.fields.map((field) => ({ field: field.name, value: values[field.name] })),
        ipHash,
      }),
    });
    return created.ok ? { status: 'sent' } : { status: 'rejected', reason: 'failed', values };
  } catch {
    return { status: 'rejected', reason: 'failed', values };
  }
}
