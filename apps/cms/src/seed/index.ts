import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'

import type { Image, Video } from '../payload-types'
import { seedContactForm } from './contact-form'
import { seedUsers } from './users'

const mediaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'media')

const BLENDER_CREDITS =
  'Clip di esempio © Blender Foundation | studio.blender.org, rilasciate con licenza Creative Commons Attribution 3.0.'

const BLENDER_LINK = (film: string) => ({ label: 'Blender Studio', href: `https://studio.blender.org/films/${film}/` })

// Content of the original template site, in the order it listed it.
const PROJECTS = [
  {
    slug: 'supernova',
    title: 'Supernova',
    client: 'Supernova Festival',
    role: 'Regia, riprese e montaggio',
    date: '2018-2022',
    preview: 'Quattro edizioni di un festival raccontate tra palco, backstage e pubblico.',
    description:
      'Un racconto lungo quattro anni: dalla prima edizione in un cortile alle serate sold-out. ' +
      'Riprese con camera a mano e ottiche vintage per restituire l’energia dei concerti, ' +
      'montaggio serrato a ritmo di musica e color grading pensato per le luci di scena.',
    clips: 1,
    externalLink: { label: 'YouTube', href: 'https://www.youtube.com/' },
    featured: true,
    en: {
      role: 'Direction, filming and editing',
      preview: 'Four editions of a festival told through stage, backstage and audience.',
      description:
        'A story four years long: from the first edition in a courtyard to the sold-out nights. ' +
        'Handheld camera and vintage lenses capture the energy of the concerts, with tight ' +
        'music-driven editing and a colour grade built for stage lighting.',
    },
  },
  {
    slug: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    client: 'Blender Studio',
    role: 'Trailer e montaggio',
    date: '2008',
    preview: 'Un trailer comico e colorato per un cortometraggio d’animazione open source.',
    description:
      'Trailer promozionale per il cortometraggio “Big Buck Bunny”. Il lavoro si è concentrato ' +
      'sul ritmo comico: tagli sui tempi delle gag, sound design esagerato e una palette satura ' +
      'che accompagna lo spettatore nel bosco del protagonista.',
    clips: 3,
    externalLink: BLENDER_LINK('big-buck-bunny'),
    credits: BLENDER_CREDITS,
    featured: true,
  },
  {
    slug: 'sintel',
    title: 'Sintel',
    client: 'Blender Studio',
    role: 'Trailer, color grading',
    date: '2010',
    preview: 'Atmosfere fantasy e paesaggi innevati per il trailer di un corto epico.',
    description:
      'Trailer per “Sintel”, la storia di una ragazza alla ricerca del suo drago. ' +
      'Montaggio costruito sulla tensione crescente della colonna sonora, con un grading freddo ' +
      'per le montagne e toni caldi per i ricordi della protagonista.',
    clips: 3,
    externalLink: BLENDER_LINK('sintel'),
    credits: BLENDER_CREDITS,
    featured: true,
  },
  {
    slug: 'tears-of-steel',
    title: 'Tears of Steel',
    client: 'Blender Studio',
    role: 'Montaggio, VFX compositing',
    date: '2012',
    preview: 'Fantascienza ad Amsterdam: live action e effetti visivi in un unico flusso.',
    description:
      'Cortometraggio di fantascienza girato ad Amsterdam che unisce riprese dal vero ed effetti ' +
      'digitali. Mi sono occupato del montaggio delle sequenze d’azione e dell’integrazione ' +
      'dei VFX, mantenendo coerenza di luce e grana tra le inquadrature.',
    clips: 3,
    externalLink: BLENDER_LINK('tears-of-steel'),
    credits: BLENDER_CREDITS,
  },
  {
    slug: 'elephants-dream',
    title: 'Elephants Dream',
    client: 'Blender Studio',
    role: 'Montaggio, sound design',
    date: '2006',
    preview: 'Un viaggio surreale dentro una macchina infinita.',
    description:
      'Il primo “open movie” della storia: due personaggi attraversano un mondo meccanico e ' +
      'onirico. Il montaggio alterna inquadrature lunghe e contemplative a improvvise accelerazioni, ' +
      'con un sound design industriale a fare da filo conduttore.',
    clips: 3,
    externalLink: BLENDER_LINK('elephants-dream'),
    credits: BLENDER_CREDITS,
  },
]

const PHOTOS = [
  { file: 'basilica.jpg', alt: 'Facciata di una basilica sotto un cielo azzurro', altEn: 'Basilica facade under a blue sky', credit: 'Wilfredor, CC0 1.0, Wikimedia Commons' },
  { file: 'iguana.jpg', alt: 'Ritratto ravvicinato di una iguana', altEn: 'Close-up portrait of an iguana', credit: 'Wilfredor, CC0 1.0, Wikimedia Commons' },
  { file: 'fort.jpg', alt: 'Forte sull’isola di San Carlos, Venezuela', altEn: 'Fort on San Carlos island, Venezuela', credit: 'Wilfredor, CC0 1.0, Wikimedia Commons' },
  { file: 'tower.jpg', alt: 'Torre di guardia di una diga in Andalusia', altEn: 'Watch tower of a dam in Andalusia', credit: 'Jebulon, CC0 1.0, Wikimedia Commons' },
]

const PROFILE = {
  name: "Stefano D'Ambrosio",
  role: 'Videomaker & Editor',
  bio:
    'Videomaker e montatore con base in Emilia-Romagna. Racconto festival, teatro e musica ' +
    'dal vivo, e curo trailer e contenuti promozionali per produzioni indipendenti, ' +
    'seguendo ogni progetto dalla ripresa alla consegna finale.',
  contact: { email: 'ciao@example.com', phone: '+39 000 000 0000', instagram: 'https://www.instagram.com/' },
  clients: ['Santarcangelo Festival', 'Motus', 'Supernova', 'Blender Studio'].map((name) => ({ name })),
}

export async function seed(payload: Payload): Promise<void> {
  const log = payload.logger.info.bind(payload.logger)

  // 1. Accounts, owner first.
  await seedUsers(payload)

  // 2. Media, looked up by stored file name so a second run reuses it. `as` renames
  // the file on upload (clips of different projects share base names).
  type Media<T extends 'images' | 'videos'> = T extends 'images' ? Image : Video
  const upload = async <T extends 'images' | 'videos'>(
    collection: T,
    file: string,
    data: Record<string, unknown>,
    storedAs = path.basename(file),
  ): Promise<Media<T>> => {
    const existing = await payload.find({ collection, where: { filename: { equals: storedAs } }, limit: 1, overrideAccess: true })
    if (existing.docs[0]) return existing.docs[0] as Media<T>
    const dir = await mkdtemp(path.join(tmpdir(), 'seed-'))
    const target = path.join(dir, storedAs)
    await copyFile(path.join(mediaDir, file), target)
    try {
      return (await payload.create({ collection, data: data as never, filePath: target, locale: 'it', overrideAccess: true })) as Media<T>
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  const projectIds = new Map<string, number>()
  for (const project of PROJECTS) {
    const existing = await payload.find({ collection: 'projects', where: { slug: { equals: project.slug } }, limit: 1, draft: true, overrideAccess: true })
    if (existing.docs[0]) {
      projectIds.set(project.slug, existing.docs[0].id)
      continue
    }
    const items: { blockType: 'video'; video: number }[] = []
    for (let n = 1; n <= project.clips; n++) {
      const base = `${project.slug}-${n}`
      const poster = await upload('images', `videos/${project.slug}/${n}-poster.jpg`, { alt: `Fotogramma di ${project.title}` }, `${base}-poster.jpg`)
      const webm = await upload('videos', `videos/${project.slug}/${n}.webm`, { title: `${project.title} ${n} (WebM)` }, `${base}.webm`)
      const mp4 = await upload('videos', `videos/${project.slug}/${n}.mp4`, { title: `${project.title} ${n}`, poster: poster.id, webm: webm.id }, `${base}.mp4`)
      items.push({ blockType: 'video', video: mp4.id })
    }
    const { clips: _clips, en, ...fields } = project as typeof project & { en?: Record<string, string> }
    const created = await payload.create({
      collection: 'projects',
      data: { ...fields, order: (PROJECTS.indexOf(project) + 1) * 10, items, _status: 'published' } as never,
      locale: 'it',
      overrideAccess: true,
    })
    if (en) {
      await payload.update({ collection: 'projects', id: created.id, data: { title: project.title, ...en } as never, locale: 'en', overrideAccess: true })
    }
    projectIds.set(project.slug, created.id)
    log(`seed: created project ${project.slug}`)
  }

  // 3. Sample photography project.
  const photoSlug = 'sample-photography'
  const hasPhotos = await payload.find({ collection: 'projects', where: { slug: { equals: photoSlug } }, limit: 1, draft: true, overrideAccess: true })
  if (hasPhotos.totalDocs === 0) {
    const items: { blockType: 'photo'; image: number }[] = []
    for (const photo of PHOTOS) {
      const image = await upload('images', `photos/${photo.file}`, { alt: photo.alt, credit: photo.credit })
      await payload.update({ collection: 'images', id: image.id, data: { alt: photo.altEn }, locale: 'en', overrideAccess: true })
      items.push({ blockType: 'photo', image: image.id })
    }
    await payload.create({
      collection: 'projects',
      data: {
        slug: photoSlug,
        title: 'Fotografie di esempio',
        client: 'Wikimedia Commons',
        role: 'Fotografia',
        date: '2024',
        preview: 'Quattro fotografie CC0 che mostrano come appare un progetto fotografico.',
        description: 'Fotografie di esempio con licenza CC0 da Wikimedia Commons, usate per mostrare la galleria. Sostituiscile con i tuoi scatti.',
        credits: 'Fotografie di Wilfredor e Jebulon, CC0 1.0, via Wikimedia Commons.',
        featured: true,
        order: 100,
        items,
        _status: 'published',
      } as never,
      locale: 'it',
      overrideAccess: true,
    })
    log('seed: created project sample-photography')
  }

  // 4. Profile, only while it is still empty so an owner's edits survive a re-run.
  const profile = await payload.findGlobal({ slug: 'profile', draft: true, overrideAccess: true })
  if (!profile.name) {
    // Placeholder until the owner uploads a portrait: a CC0 photo from the sample set.
    const photo = await upload('images', 'photos/tower.jpg', { alt: 'Torre di guardia sul lago (segnaposto)' }, 'profile.jpg')
    const hero = await payload.find({ collection: 'videos', where: { filename: { equals: 'supernova-1.mp4' } }, limit: 1, overrideAccess: true })
    await payload.updateGlobal({
      slug: 'profile',
      data: {
        ...PROFILE,
        photo: photo.id,
        hero: hero.docs[0] ? { relationTo: 'videos', value: hero.docs[0].id } : undefined,
        _status: 'published',
      } as never,
      locale: 'it',
      overrideAccess: true,
    })
    await payload.updateGlobal({
      slug: 'profile',
      data: {
        role: 'Videomaker & Editor',
        bio:
          'Videomaker and editor based in Emilia-Romagna. I cover festivals, theatre and live music, ' +
          'and cut trailers and promotional content for independent productions, following each ' +
          'project from shoot to final delivery.',
      } as never,
      locale: 'en',
      overrideAccess: true,
    })
    log('seed: created profile')
  }

  // 5. The contact form the info page renders.
  await seedContactForm(payload)
}
