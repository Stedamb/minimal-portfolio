import { describe, expect, it, vi } from 'vitest';
import type { Image, Profile, Project, Video } from '@repo/shared';
import { mapProfile, mapProject, safeUrl } from '../src/lib/mappers';
import { getProject } from '../src/lib/payload';

const CMS = 'http://cms.test';
const ctx = { cmsUrl: CMS };

const size = (width: number, name = `w${width}`) => ({ url: `/api/images/file/p-${name}.webp`, width, height: Math.round(width * 0.66) });

const image = (over: Partial<Image> = {}): Image => ({
  id: 1,
  alt: 'Una torre',
  url: '/api/images/file/p.jpg',
  focalX: 30,
  focalY: 70,
  sizes: { w640: size(640), w1280: size(1280), w1920: size(1920), w2560: size(2560) },
  createdAt: '',
  updatedAt: '',
  ...over,
});

const video = (over: Partial<Video> = {}): Video => ({
  id: 5,
  title: 'Clip',
  url: '/api/videos/file/clip.mp4',
  mimeType: 'video/mp4',
  poster: image({ id: 9 }),
  createdAt: '',
  updatedAt: '',
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({
  id: 3,
  slug: 'mixed',
  title: 'Misto',
  client: 'Cliente',
  role: 'Ruolo',
  date: '2024',
  preview: 'Anteprima',
  description: 'Descrizione',
  items: [
    { blockType: 'photo', image: image(), caption: 'Didascalia' },
    { blockType: 'video', video: video() },
    { blockType: 'photo', image: image({ id: 2, alt: 'Altra' }) },
  ],
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('mapProject', () => {
  it('maps mixed items in order and takes the cover from the first one', () => {
    const mapped = mapProject(project(), ctx);
    expect(mapped.items.map((item) => item.kind)).toEqual(['photo', 'video', 'photo']);
    expect(mapped.cover).toBe(mapped.items[0]);
    expect(mapped.title).toBe('Misto');
    const first = mapped.items[0];
    expect(first.kind === 'photo' && first.caption).toBe('Didascalia');
  });

  it('makes a video cover when the first item is a video', () => {
    const mapped = mapProject(
      project({ items: [{ blockType: 'video', video: video() }, { blockType: 'photo', image: image() }] }),
      ctx,
    );
    expect(mapped.cover?.kind).toBe('video');
  });

  it('skips items whose media was not populated', () => {
    const mapped = mapProject(project({ items: [{ blockType: 'photo', image: 42 }, { blockType: 'video', video: video() }] }), ctx);
    expect(mapped.items).toHaveLength(1);
    expect(mapped.cover?.kind).toBe('video');
  });

  it('emits the WebM source before the MP4 one when both exist', () => {
    const webm = video({ id: 6, url: '/api/videos/file/clip.webm', mimeType: 'video/webm', poster: null });
    const mapped = mapProject(project({ items: [{ blockType: 'video', video: video({ webm }) }] }), ctx);
    const item = mapped.items[0];
    if (item.kind !== 'video') throw new Error('expected a video');
    expect(item.sources).toEqual([
      { src: `${CMS}/api/videos/file/clip.webm`, type: 'video/webm' },
      { src: `${CMS}/api/videos/file/clip.mp4`, type: 'video/mp4' },
    ]);
    expect(item.poster).toContain(`${CMS}/api/images/file/`);
  });

  it('emits only the MP4 source when there is no WebM', () => {
    const mapped = mapProject(project({ items: [{ blockType: 'video', video: video({ webm: null }) }] }), ctx);
    const item = mapped.items[0];
    if (item.kind !== 'video') throw new Error('expected a video');
    expect(item.sources).toEqual([{ src: `${CMS}/api/videos/file/clip.mp4`, type: 'video/mp4' }]);
  });

  it('emits a srcset with every generated size and the focal point as object-position', () => {
    const item = mapProject(project(), ctx).items[0];
    if (item.kind !== 'photo') throw new Error('expected a photo');
    expect(item.srcset.split(', ')).toEqual([
      `${CMS}/api/images/file/p-w640.webp 640w`,
      `${CMS}/api/images/file/p-w1280.webp 1280w`,
      `${CMS}/api/images/file/p-w1920.webp 1920w`,
      `${CMS}/api/images/file/p-w2560.webp 2560w`,
    ]);
    expect(item.objectPosition).toBe('30% 70%');
    expect(item.alt).toBe('Una torre');
  });

  it('centres the image and skips ungenerated sizes when there is no focal point', () => {
    const item = mapProject(
      project({ items: [{ blockType: 'photo', image: image({ focalX: null, focalY: null, sizes: { w640: size(640), w1280: { url: null } } }) }] }),
      ctx,
    ).items[0];
    if (item.kind !== 'photo') throw new Error('expected a photo');
    expect(item.objectPosition).toBe('50% 50%');
    expect(item.srcset).toBe(`${CMS}/api/images/file/p-w640.webp 640w`);
  });

  it('lists a file once when small originals make several sizes identical', () => {
    const same = { url: '/api/images/file/p-1600.webp', width: 1600 };
    const item = mapProject(
      project({ items: [{ blockType: 'photo', image: image({ sizes: { w640: size(640), w1920: same, w2560: same } }) }] }),
      ctx,
    ).items[0];
    if (item.kind !== 'photo') throw new Error('expected a photo');
    expect(item.srcset.split(', ')).toHaveLength(2);
  });

  it('keeps absolute media URLs untouched', () => {
    const abs = 'https://blob.example/a.jpg';
    const item = mapProject(project({ items: [{ blockType: 'photo', image: image({ url: abs, sizes: {} }) }] }), ctx).items[0];
    if (item.kind !== 'photo') throw new Error('expected a photo');
    expect(item.src).toBe(abs);
  });

  it('renders the Italian description when the CMS answers an English request with the fallback', () => {
    // With fallback: true Payload fills the missing English field with the Italian text.
    const fallback = project({ description: 'Descrizione italiana' });
    expect(mapProject(fallback, ctx).description).toBe('Descrizione italiana');
  });

  it('drops an external link with a javascript: scheme and keeps http(s)', () => {
    expect(mapProject(project({ externalLink: { label: 'x', href: 'javascript:alert(1)' } }), ctx).externalLink).toBeUndefined();
    expect(mapProject(project({ externalLink: { label: 'Sito', href: 'https://example.com/a' } }), ctx).externalLink).toEqual({
      label: 'Sito',
      href: 'https://example.com/a',
    });
  });
});

describe('safeUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['http://example.com/x', 'http://example.com/x'],
    ['mailto:a@b.it', 'mailto:a@b.it'],
  ])('allows %s', (input, output) => expect(safeUrl(input)).toBe(output));

  it.each(['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', 'tel:+39', '/relative', '', null, undefined])(
    'drops %s',
    (input) => expect(safeUrl(input as string)).toBeUndefined(),
  );
});

describe('mapProfile', () => {
  const profile = (over: Partial<Profile> = {}): Profile => ({
    id: 1,
    name: 'Ada',
    role: 'Fotografa',
    bio: 'Bio',
    photo: image(),
    hero: { relationTo: 'videos', value: video() },
    clients: [{ name: 'A' }, { name: 'B' }],
    contact: { email: 'ada@example.com', phone: '+39 000 111 2222', instagram: 'javascript:alert(1)' },
    ...over,
  });

  it('maps the profile, builds contact hrefs and drops unsafe links', () => {
    const mapped = mapProfile(profile(), ctx);
    expect(mapped.clients).toEqual(['A', 'B']);
    expect(mapped.hero?.kind).toBe('video');
    expect(mapped.photo?.kind).toBe('photo');
    expect(mapped.emailHref).toBe('mailto:ada@example.com');
    expect(mapped.phoneHref).toBe('tel:+390001112222');
    expect(mapped.instagram).toBeUndefined();
  });

  it('accepts an image as hero', () => {
    expect(mapProfile(profile({ hero: { relationTo: 'images', value: image() } }), ctx).hero?.kind).toBe('photo');
  });
});

describe('getProject (client)', () => {
  it('asks for the locale and returns the mapped project, Italian text included on fallback', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ docs: [project({ description: 'Descrizione italiana' })] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await getProject('mixed', 'en', { cmsUrl: CMS });
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin).toBe(CMS);
    expect(url.pathname).toBe('/api/projects');
    expect(url.searchParams.get('locale')).toBe('en');
    expect(url.searchParams.get('where[slug][equals]')).toBe('mixed');
    expect(result?.description).toBe('Descrizione italiana');
    vi.unstubAllGlobals();
  });

  it('returns null for an unknown slug', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ docs: [] })));
    expect(await getProject('nope', 'it', { cmsUrl: CMS })).toBeNull();
    vi.unstubAllGlobals();
  });
});
