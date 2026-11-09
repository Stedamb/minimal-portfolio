import { actions } from 'astro:actions';

// Progressive enhancement for the contact form: without this script the form posts to the
// Action and the page redirects back with a status anchor. With it, the same Action is called
// in place and the form is replaced by the message. Idempotent.

type Reason = 'too_fast' | 'expired' | 'rate_limited' | 'failed';

export function initContactForm() {
  const card = document.querySelector<HTMLElement>('[data-contact]');
  const form = card?.querySelector<HTMLFormElement>('form[data-contact-form]');
  if (!card || !form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const label = button.textContent ?? '';
  const error = card.querySelector<HTMLElement>('[data-contact-error]')!;
  const messages = JSON.parse(card.dataset.messages ?? '{}') as Record<string, string>;
  const fail = (key: string) => {
    error.textContent = messages[key] ?? messages.failed ?? '';
    error.hidden = false;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    button.textContent = messages.sending ?? label;
    try {
      const { data } = await actions.contact(new FormData(form));
      if (data?.status === 'sent') {
        card.dataset.state = 'sent';
        card.querySelector<HTMLElement>('#contact-sent')?.focus();
        return;
      }
      if (data?.status === 'invalid') {
        for (const input of form.querySelectorAll<HTMLElement>('[name]')) {
          input.setAttribute('aria-invalid', String(data.missing.includes(input.getAttribute('name')!)));
        }
        (form.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
        fail('required');
      } else {
        const reason = (data?.status === 'rejected' ? data.reason : 'failed') as Reason;
        fail({ too_fast: 'tooFast', expired: 'expired', rate_limited: 'rateLimited', failed: 'failed' }[reason]);
      }
    } catch {
      fail('failed');
    }
    button.disabled = false;
    button.textContent = label;
  });
}
