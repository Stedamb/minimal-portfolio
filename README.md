# Minimal Portfolio

Static video portfolio built with [Astro](https://astro.build) and Tailwind CSS. No UI framework: interactive bits (Lenis smooth scrolling, custom cursor, lazy video playback, marquee, fullscreen gallery) are small inline scripts.

## Commands

```sh
pnpm install
pnpm dev       # dev server
pnpm build     # type-check + static build to dist/
pnpm preview   # serve the build
```

## Content

All content lives in `src/data/`:

- `projects.ts`: the project list. Every entry gets a page at `/projects/<slug>`; entries with `featured: true` also appear on the homepage. The first video of a project is its cover.
- `profile.ts`: name, bio, contact details, hero video and the clients shown in the homepage marquee. **The contact details are placeholders.**

Videos go in `public/videos/<slug>/` as `N.mp4`, with an optional `N.webm` (served first when present) and `N-poster.jpg`. To encode a clip:

```sh
ffmpeg -i in.mov -an -vf "scale='min(1280,iw)':-2" -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart 1.mp4
ffmpeg -i in.mov -an -vf "scale='min(1280,iw)':-2" -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 1.webm
ffmpeg -ss 1 -i 1.mp4 -frames:v 1 -q:v 5 1-poster.jpg
```

## Sample media credits

The Big Buck Bunny, Sintel, Tears of Steel and Elephants Dream clips, and `public/images/profile-placeholder.jpg`, are excerpts from films © Blender Foundation | [studio.blender.org](https://studio.blender.org), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They are placeholders and should be replaced with your own work.
