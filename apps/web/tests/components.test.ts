import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import Navbar from '../src/components/Navbar.astro';
import Contact from '../src/components/Contact.astro';
import NavSection from '../src/components/sections/NavSection.astro';
import NotFound from '../src/components/NotFound.astro';
import Project from '../src/components/Project.astro';
import type { ProfileView, ProjectView } from '../src/lib/mappers';

const profile: ProfileView = {
  name: 'Ada',
  role: 'Fotografa',
  bio: 'Bio',
  clients: [],
  email: 'ada@example.com',
  emailHref: 'mailto:ada@example.com',
  phone: '+39 000',
  phoneHref: 'tel:+39000',
  instagram: 'https://www.instagram.com/',
  photo: { kind: 'photo', src: 'http://cms/p.jpg', srcset: '', alt: '', objectPosition: '50% 50%', tags: [] },
};

const ITALIAN_ONLY = ['Scrivimi', 'Chiama', 'Telefono', 'Scopri di più', 'Chiudi', 'Contatti', 'Guarda tutti', 'Contattami', 'Ritratto di', 'Torna'];

const render = async (component: Parameters<AstroContainer['renderToString']>[0], props: Record<string, unknown>) =>
  (await AstroContainer.create()).renderToString(component, { props });

describe('English pages', () => {
  it('render English nav, contact and section labels with no Italian interface string', async () => {
    const html = (
      await Promise.all([
        render(Navbar, { name: 'Ada', locale: 'en', pathname: '/en/info' }),
        render(Contact, { profile, locale: 'en' }),
        render(NavSection, { locale: 'en' }),
        render(NotFound, { locale: 'en' }),
      ])
    ).join('\n');
    for (const word of ITALIAN_ONLY) expect(html).not.toContain(word);
    for (const word of ['Write to me', 'Call', 'Phone', 'See all projects', 'Get in touch', 'Portrait of Ada', 'This page does not exist']) {
      expect(html).toContain(word);
    }
    expect(html).toContain('href="/en/portfolio"');
  });

  it('render Italian labels on the Italian pages', async () => {
    const html = (await render(Contact, { profile, locale: 'it' })) + (await render(NavSection, { locale: 'it' }));
    for (const word of ['Scrivimi', 'Chiama', 'Telefono', 'Guarda tutti i progetti', 'Contattami', 'Ritratto di Ada']) {
      expect(html).toContain(word);
    }
    expect(html).toContain('href="/portfolio"');
  });
});

describe('language switch in the navbar', () => {
  it('links /projects/x to /en/projects/x and back', async () => {
    const it = await render(Navbar, { name: 'Ada', locale: 'it', pathname: '/projects/x' });
    expect(it).toContain('href="/en/projects/x"');
    expect(it).toContain('>EN<');
    const en = await render(Navbar, { name: 'Ada', locale: 'en', pathname: '/en/projects/x' });
    expect(en).toContain('href="/projects/x"');
    expect(en).toContain('>IT<');
  });
});

describe('gallery', () => {
  it('renders photos and videos in one ordered list with captions under photos', async () => {
    const photo = (alt: string, caption?: string) => ({ kind: 'photo' as const, src: `http://cms/${alt}.jpg`, srcset: '', alt, caption, objectPosition: '50% 50%', tags: [] });
    const video = { kind: 'video' as const, sources: [{ src: 'http://cms/v.mp4', type: 'video/mp4' }], tags: [] };
    const items = [photo('first', 'Prima'), video, photo('third')];
    const project: ProjectView = {
      id: 1, slug: 'x', title: 'X', client: 'C', role: '', date: '', preview: '', description: 'D', featured: false, items, cover: items[0],
    };
    const html = await render(Project, { project, locale: 'en' });
    expect(html.indexOf('alt="first"')).toBeLessThan(html.indexOf('<video'));
    expect(html.indexOf('<video')).toBeLessThan(html.indexOf('alt="third"'));
    expect(html).toContain('<small>Prima</small>');
    expect(html.match(/data-gallery-item/g)).toHaveLength(3);
    expect(html).toContain('Close');
  });
});
