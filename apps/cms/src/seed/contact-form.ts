import type { Payload } from 'payload'

export const CONTACT_FORM_SLUG = 'contact'

const paragraph = (text: string) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        textFormat: 0,
        children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }],
      },
    ],
  },
})

const COPY = {
  it: {
    title: 'Contatti',
    labels: { name: 'Nome', email: 'E-mail', message: 'Messaggio' },
    submit: 'Invia',
    confirmation: 'Grazie, il messaggio è stato inviato. Ti risponderò presto.',
  },
  en: {
    title: 'Contact',
    labels: { name: 'Name', email: 'E-mail', message: 'Message' },
    submit: 'Send',
    confirmation: 'Thanks, your message has been sent. I will get back to you soon.',
  },
}

// The contact form the site renders on the info page: name, e-mail, message. Idempotent:
// an existing form (possibly edited by the owner) is left alone.
export async function seedContactForm(payload: Payload): Promise<void> {
  const existing = await payload.find({
    collection: 'forms',
    where: { slug: { equals: CONTACT_FORM_SLUG } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) return

  const fields = (locale: 'it' | 'en') => [
    { blockType: 'text' as const, name: 'name', label: COPY[locale].labels.name, width: 100, required: true },
    { blockType: 'email' as const, name: 'email', label: COPY[locale].labels.email, width: 100, required: true },
    { blockType: 'textarea' as const, name: 'message', label: COPY[locale].labels.message, width: 100, required: true },
  ]

  const created = await payload.create({
    collection: 'forms',
    locale: 'it',
    data: {
      slug: CONTACT_FORM_SLUG,
      title: COPY.it.title,
      fields: fields('it'),
      submitButtonLabel: COPY.it.submit,
      confirmationType: 'message',
      confirmationMessage: paragraph(COPY.it.confirmation),
    },
    overrideAccess: true,
  })

  // English labels go on the same blocks: re-send them with their ids so Payload updates the
  // localized values instead of adding rows.
  await payload.update({
    collection: 'forms',
    id: created.id,
    locale: 'en',
    data: {
      title: COPY.en.title,
      fields: (created.fields ?? []).map((block) => ({
        ...block,
        label: COPY.en.labels[block.name as keyof typeof COPY.en.labels],
      })),
      submitButtonLabel: COPY.en.submit,
      confirmationMessage: paragraph(COPY.en.confirmation),
    },
    overrideAccess: true,
  })
  payload.logger.info('seed: created the contact form')
}
