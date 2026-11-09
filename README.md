# Minimal Portfolio

A minimal, editorial portfolio template for visual artists: filmmakers, videomakers and photographers who want their work to fill the screen with as little interface around it as possible.

**Live demo:** [videomaker-v2.vercel.app](https://videomaker-v2.vercel.app)

Where [Videomaker Portfolio](https://github.com/Stedamb/videomaker-portfolio) is a video journal built around React islands and page transitions, this one is a lighter template: fully static Astro with no UI framework. Every interactive detail is a small inline script.

## Features

- **Work first**: full-bleed media, large serif and grotesk typography, and a scrolling client marquee
- **Project pages**: each project lists client, role, date and credits, with its own gallery and a fullscreen viewer
- **Light on the network**: videos load lazily as they scroll into view, WebM is served before MP4 when present, and posters keep the layout stable
- **Small touches**: Lenis smooth scrolling and a custom cursor
- **Content in one place**: projects and profile are plain TypeScript files with typed data

Projects are made of video clips today. Still-image (photography) projects are the next addition.

## Tech stack

| Area      | Tooling                                    |
| --------- | ------------------------------------------ |
| Framework | Astro 7 (static output, no UI framework)   |
| Styling   | Tailwind CSS 4 (`@tailwindcss/vite`)       |
| Motion    | Lenis, CSS                                 |
| Language  | TypeScript                                 |
| Packages  | pnpm                                       |

## Getting started

Requires Node.js 22.12 or later and [pnpm](https://pnpm.io) (`corepack enable` picks up the pinned version).

```sh
pnpm install
pnpm dev       # dev server at http://localhost:4321
pnpm build     # type-check, then static build to dist/
pnpm preview   # serve the build
```

## Content

All content lives in `src/data/`:

- `projects.ts`: the project list. Every entry gets a page at `/projects/<slug>`. Entries with `featured: true` also appear on the homepage, and the first video of a project is its cover.
- `profile.ts`: name, bio, contact details, hero video and the clients in the homepage marquee. **The contact details are placeholders.**

Videos go in `public/videos/<slug>/` as `N.mp4`, with an optional `N.webm` (served first when present) and `N-poster.jpg`. To encode a clip:

```sh
ffmpeg -i in.mov -an -vf "scale='min(1280,iw)':-2" -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart 1.mp4
ffmpeg -i in.mov -an -vf "scale='min(1280,iw)':-2" -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 1.webm
ffmpeg -ss 1 -i 1.mp4 -frames:v 1 -q:v 5 1-poster.jpg
```

## Sample media credits

The Big Buck Bunny, Sintel, Tears of Steel and Elephants Dream clips are excerpts from films © Blender Foundation | [studio.blender.org](https://studio.blender.org), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They are placeholders, to be replaced with your own work.

## License

Code is released under the [MIT License](LICENSE). The profile photo is © Stefano D'Ambrosio, and the sample clips keep their own licence (see above). Neither is covered by the MIT License.
