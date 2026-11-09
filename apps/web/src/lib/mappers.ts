import type { Image, Profile, Project, Video } from '@repo/shared';

// Converts Payload documents into the plain shapes the components take. Every
// URL-valued field goes through safeUrl here, on the public and the preview render alike.

export interface MapContext {
  /** Base URL of the CMS, used to absolutise relative media URLs. */
  cmsUrl: string;
}

export interface PhotoItem {
  kind: 'photo';
  src: string;
  srcset: string;
  alt: string;
  caption?: string;
  /** CSS object-position built from the focal point set in the CMS. */
  objectPosition: string;
  width?: number;
  height?: number;
}

export interface VideoItem {
  kind: 'video';
  /** WebM first when present, then MP4: browsers use the first source they support. */
  sources: { src: string; type: string }[];
  poster?: string;
}

export type MediaItem = PhotoItem | VideoItem;

export interface ProjectView {
  slug: string;
  title: string;
  client: string;
  role: string;
  /** Free-form so it can hold ranges such as "2018-2022". */
  date: string;
  preview: string;
  description: string;
  credits?: string;
  externalLink?: { label: string; href: string };
  featured: boolean;
  items: MediaItem[];
  /** The first item is the cover on the homepage and the portfolio. */
  cover?: MediaItem;
}

export interface ProfileView {
  name: string;
  role: string;
  bio: string;
  photo?: PhotoItem;
  hero?: MediaItem;
  clients: string[];
  email?: string;
  emailHref?: string;
  phone?: string;
  phoneHref?: string;
  instagram?: string;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Returns the normalised URL when its scheme is http, https or mailto, otherwise undefined. */
export function safeUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const absolute = (url: string | null | undefined, { cmsUrl }: MapContext): string | undefined =>
  url ? new URL(url, cmsUrl).href : undefined;

const populated = <T extends object>(value: number | T | null | undefined): T | undefined =>
  value && typeof value === 'object' ? value : undefined;

const SIZE_KEYS = ['w640', 'w1280', 'w1920', 'w2560'] as const;

export function mapImage(image: Image, ctx: MapContext, caption?: string | null): PhotoItem | undefined {
  const sizes = SIZE_KEYS.flatMap((key) => {
    const size = image.sizes?.[key];
    const url = absolute(size?.url, ctx);
    return url && size?.width ? [{ url, width: size.width }] : [];
    // Small originals are not enlarged, so several sizes can be the same file: list it once.
  }).filter((size, index, all) => all.findIndex((other) => other.url === size.url) === index);
  const src = absolute(image.sizes?.w1280?.url, ctx) ?? absolute(image.url, ctx) ?? sizes[0]?.url;
  if (!src) return undefined;
  return {
    kind: 'photo',
    src,
    srcset: sizes.map(({ url, width }) => `${url} ${width}w`).join(', '),
    alt: image.alt ?? '',
    caption: caption || undefined,
    objectPosition: `${image.focalX ?? 50}% ${image.focalY ?? 50}%`,
    width: image.width ?? undefined,
    height: image.height ?? undefined,
  };
}

export function mapVideo(video: Video, ctx: MapContext): VideoItem | undefined {
  const mp4 = absolute(video.url, ctx);
  if (!mp4) return undefined;
  const webm = populated(video.webm);
  const webmUrl = absolute(webm?.url, ctx);
  const poster = populated(video.poster);
  return {
    kind: 'video',
    sources: [
      ...(webmUrl ? [{ src: webmUrl, type: webm?.mimeType || 'video/webm' }] : []),
      { src: mp4, type: video.mimeType || 'video/mp4' },
    ],
    poster: poster ? mapImage(poster, ctx)?.src : undefined,
  };
}

export function mapProject(doc: Project, ctx: MapContext): ProjectView {
  const items = doc.items.flatMap((item): MediaItem[] => {
    const mapped =
      item.blockType === 'photo'
        ? ((image) => image && mapImage(image, ctx, item.caption))(populated(item.image))
        : ((video) => video && mapVideo(video, ctx))(populated(item.video));
    return mapped ? [mapped] : [];
  });
  const href = safeUrl(doc.externalLink?.href);
  return {
    slug: doc.slug,
    title: doc.title,
    client: doc.client,
    role: doc.role ?? '',
    date: doc.date ?? '',
    preview: doc.preview ?? '',
    description: doc.description ?? '',
    credits: doc.credits || undefined,
    externalLink: href ? { label: doc.externalLink?.label || href, href } : undefined,
    featured: Boolean(doc.featured),
    items,
    cover: items[0],
  };
}

export function mapProfile(doc: Profile, ctx: MapContext): ProfileView {
  const photo = populated(doc.photo);
  const hero = doc.hero?.value && typeof doc.hero.value === 'object' ? doc.hero : undefined;
  const email = doc.contact?.email || undefined;
  const phone = doc.contact?.phone || undefined;
  return {
    name: doc.name,
    role: doc.role ?? '',
    bio: doc.bio ?? '',
    photo: photo && mapImage(photo, ctx),
    hero:
      hero?.relationTo === 'images'
        ? mapImage(hero.value as Image, ctx)
        : hero?.relationTo === 'videos'
          ? mapVideo(hero.value as Video, ctx)
          : undefined,
    clients: (doc.clients ?? []).map((client) => client.name),
    email,
    emailHref: safeUrl(email && `mailto:${email}`),
    phone,
    phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined,
    instagram: safeUrl(doc.contact?.instagram),
  };
}
