export const locales = ['it', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'it';
export const isLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value);

export interface Strings {
  nav: { work: string; info: string; switchLanguage: string };
  titles: { home: string; portfolio: string; info: string; notFound: string };
  home: { allProjects: string; portfolio: string; getInTouch: string; contacts: string };
  project: { discoverMore: string; close: string };
  contact: { email: string; phone: string; writeToMe: string; call: string; instagram: string };
  form: { send: string; sending: string; sent: string; required: string; tooFast: string; expired: string; rateLimited: string; failed: string };
  notFound: { message: string; back: string };
  footer: { copyright: string; design: string };
  loader: string;
  videoUnsupported: string;
  portrait: (name: string) => string;
}

export const dictionary: Record<Locale, Strings> = {
  it: {
    nav: { work: 'Work', info: 'Info', switchLanguage: 'English' },
    titles: { home: 'Home', portfolio: 'Portfolio', info: 'Contatti', notFound: 'Pagina non trovata' },
    home: { allProjects: 'Guarda tutti i progetti', portfolio: 'Portfolio', getInTouch: 'Contattami', contacts: 'Contatti' },
    project: { discoverMore: 'Scopri di più', close: 'Chiudi' },
    contact: { email: 'E-mail', phone: 'Telefono', writeToMe: 'Scrivimi', call: 'Chiama', instagram: 'Instagram' },
    form: {
      send: 'Invia',
      sending: 'Invio in corso…',
      sent: 'Grazie, il messaggio è stato inviato.',
      required: 'Controlla questo campo.',
      tooFast: 'Troppo veloce: attendi qualche secondo e riprova.',
      expired: 'La pagina è scaduta: ricaricala e riprova.',
      rateLimited: 'Hai inviato troppi messaggi: riprova più tardi.',
      failed: 'Non è stato possibile inviare il messaggio: riprova più tardi.',
    },
    notFound: { message: 'Questa pagina non esiste.', back: 'Torna alla home' },
    footer: { copyright: 'Copyright', design: 'Site design by SD' },
    loader: 'LOADING',
    videoUnsupported: 'Il tuo browser non supporta i video.',
    portrait: (name) => `Ritratto di ${name}`,
  },
  en: {
    nav: { work: 'Work', info: 'Info', switchLanguage: 'Italiano' },
    titles: { home: 'Home', portfolio: 'Portfolio', info: 'Contact', notFound: 'Page not found' },
    home: { allProjects: 'See all projects', portfolio: 'Portfolio', getInTouch: 'Get in touch', contacts: 'Contact' },
    project: { discoverMore: 'Discover more', close: 'Close' },
    contact: { email: 'E-mail', phone: 'Phone', writeToMe: 'Write to me', call: 'Call', instagram: 'Instagram' },
    form: {
      send: 'Send',
      sending: 'Sending…',
      sent: 'Thanks, your message has been sent.',
      required: 'Please check this field.',
      tooFast: 'Too fast: wait a few seconds and try again.',
      expired: 'This page has expired: reload it and try again.',
      rateLimited: 'You have sent too many messages: try again later.',
      failed: "Your message couldn't be sent: try again later.",
    },
    notFound: { message: 'This page does not exist.', back: 'Back to home' },
    footer: { copyright: 'Copyright', design: 'Site design by SD' },
    loader: 'LOADING',
    videoUnsupported: "Your browser doesn't support videos.",
    portrait: (name) => `Portrait of ${name}`,
  },
};

export const t = (locale: Locale): Strings => dictionary[locale];

export const localeFromPath = (pathname: string): Locale =>
  pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'it';

/** Prefixes a site path for the locale: Italian lives at the root, English under /en. */
export const localePath = (locale: Locale, path: string): string => {
  if (locale === defaultLocale) return path;
  return path === '/' ? '/en' : `/en${path}`;
};

/** The same page in the other language, so the switch keeps the current project. */
export const switchLocalePath = (pathname: string, current: Locale): string => {
  const rest = current === 'en' ? pathname.replace(/^\/en(?=\/|$)/, '') || '/' : pathname;
  const normalised = rest.length > 1 ? rest.replace(/\/$/, '') : rest;
  return localePath(current === 'en' ? 'it' : 'en', normalised);
};
