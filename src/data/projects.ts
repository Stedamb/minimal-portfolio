export interface Video {
  /** Path to the .mp4 file; a sibling .webm with the same name is served first when present. */
  src: string;
  poster?: string;
}

export interface Project {
  slug: string;
  title: string;
  client: string;
  role: string;
  /** Free-form so it can hold ranges such as "2018-2022". */
  date: string;
  /** Short teaser shown on the homepage cards. */
  preview: string;
  description: string;
  /** The first video is used as the cover on the homepage and portfolio. */
  videos: [Video, ...Video[]];
  externalLink?: { label: string; href: string };
  credits?: string;
  featured?: boolean;
}

const clip = (slug: string, index: number): Video => ({
  src: `/videos/${slug}/${index}.mp4`,
  poster: `/videos/${slug}/${index}-poster.jpg`,
});

const BLENDER_CREDITS =
  'Clip di esempio © Blender Foundation | studio.blender.org, rilasciate con licenza Creative Commons Attribution 3.0.';

export const projects: Project[] = [
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
    videos: [clip('supernova', 1)],
    externalLink: { label: 'YouTube', href: 'https://www.youtube.com/' },
    featured: true,
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
    videos: [clip('big-buck-bunny', 1), clip('big-buck-bunny', 2), clip('big-buck-bunny', 3)],
    externalLink: { label: 'Blender Studio', href: 'https://studio.blender.org/films/big-buck-bunny/' },
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
    videos: [clip('sintel', 1), clip('sintel', 2), clip('sintel', 3)],
    externalLink: { label: 'Blender Studio', href: 'https://studio.blender.org/films/sintel/' },
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
    videos: [clip('tears-of-steel', 1), clip('tears-of-steel', 2), clip('tears-of-steel', 3)],
    externalLink: { label: 'Blender Studio', href: 'https://studio.blender.org/films/tears-of-steel/' },
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
    videos: [clip('elephants-dream', 1), clip('elephants-dream', 2), clip('elephants-dream', 3)],
    externalLink: { label: 'Blender Studio', href: 'https://studio.blender.org/films/elephants-dream/' },
    credits: BLENDER_CREDITS,
  },
];

export const featuredProjects = projects.filter((project) => project.featured);
