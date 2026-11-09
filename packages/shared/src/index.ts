// Cross-app contracts. The generated Payload types are re-exported as types only, so
// `web` can type CMS responses without depending on the cms package at runtime.
export type { Image, Profile, Project, Video } from '../../../apps/cms/src/payload-types'
