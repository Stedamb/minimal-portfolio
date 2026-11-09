export const locales = ['it', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'it';

export interface Strings {
  nav: { work: string; info: string; switchLanguage: string };
  titles: { home: string; portfolio: string; info: string; notFound: string };
  home: { allProjects: string; portfolio: string; getInTouch: string; contacts: string };
  project: { discoverMore: string; close: string };
  contact: { email: string; phone: string; writeToMe: string; call: string; instagram: string };
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
