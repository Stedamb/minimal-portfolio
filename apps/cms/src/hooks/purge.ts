import { waitUntil } from '@vercel/functions'
import { FEATURED_TAG, LAYOUT_TAG, PORTFOLIO_TAG, mediaTag, projectTag, type MediaCollection } from '@repo/shared/cache-tags'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  GlobalAfterChangeHook,
  Payload,
  PayloadRequest,
} from 'payload'

import type { Project } from '../payload-types'

// Cache purge hooks. Only transitions that change public content purge: a project
// published, republished, unpublished or deleted; media changed or deleted; the profile
// published. Draft saves and autosaves never do. The call goes to web's /api/revalidate after
// the save has returned, and a failed call is logged, never thrown into the editor's save.

const TIMEOUT_MS = 5000

const unique = (tags: string[]) => [...new Set(tags)]

async function send(payload: Payload, tags: string[]) {
  const base = process.env.WEB_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!base || !secret) {
    payload.logger.warn({ msg: 'Cache purge skipped: WEB_URL or REVALIDATE_SECRET is not set', tags })
    return
  }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  try {
    const response = await fetch(new URL('/api/revalidate', base), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
        ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
      },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) payload.logger.error({ msg: `Cache purge was refused with status ${response.status}`, tags })
  } catch (err) {
    payload.logger.error({ err, msg: 'Cache purge failed', tags })
  }
}

// Runs after the response. `waitUntil` keeps the serverless function alive until the call
// settles; off Vercel it does nothing and the promise simply runs on.
function purge(req: PayloadRequest, tags: string[]) {
  waitUntil(send(req.payload, unique(tags)))
}

// The published project as it was before this save, keyed by request. Payload doesn't carry
// `context` from beforeChange to afterChange here, but the request is the same object.
const publishedBefore = new WeakMap<PayloadRequest, Map<number | string, Project | null>>()

type ProjectState = Pick<Project, 'id' | 'featured'>

// A project's pages: its own, the portfolio list, and the homepage when it is (or was) featured.
const projectTags = (...states: (Partial<ProjectState> | null | undefined)[]) => {
  const docs = states.filter((state): state is Partial<ProjectState> => Boolean(state))
  return [
    ...docs.flatMap((doc) => (doc.id === undefined ? [] : [projectTag(doc.id)])),
    PORTFOLIO_TAG,
    ...(docs.some((doc) => doc.featured) ? [FEATURED_TAG] : []),
  ]
}

async function publishedProject(req: PayloadRequest, id: number | string): Promise<Project | null> {
  const { docs } = await req.payload.find({
    collection: 'projects',
    where: { id: { equals: id } },
    draft: false,
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs[0]?._status === 'published' ? docs[0] : null
}

// `previousDoc` is the latest version, which may be an unpublished draft, so it can't say
// whether the project was live or featured. Reading the published document before the save can.
export const capturePublishedProject: CollectionBeforeChangeHook<Project> = async ({ data, originalDoc, req }) => {
  const id = originalDoc?.id
  if (id !== undefined) {
    const byId = publishedBefore.get(req) ?? new Map()
    byId.set(id, await publishedProject(req, id))
    publishedBefore.set(req, byId)
  }
  return data
}

export const purgeProjectChange: CollectionAfterChangeHook<Project> = async ({ doc, previousDoc, req }) => {
  const before = publishedBefore.get(req)?.get(doc.id) ?? null
  // Payload reports a draft save over a published project like an unpublish, so check
  // whether a published version is still live.
  const changesPublicContent = doc._status === 'published' || (before !== null && (await publishedProject(req, doc.id)) === null)
  if (changesPublicContent) purge(req, projectTags(doc, previousDoc, before))
  return doc
}

export const purgeProjectDelete: CollectionAfterDeleteHook<Project> = ({ doc, req }) => {
  purge(req, projectTags(doc))
  return doc
}

const mediaTags = (collection: MediaCollection, id: number | string) => [mediaTag(collection, id)]

export const purgeMediaChange =
  (collection: MediaCollection): CollectionAfterChangeHook =>
  ({ doc, operation, req }) => {
    // A new upload isn't on any page yet.
    if (operation === 'update') purge(req, mediaTags(collection, doc.id))
    return doc
  }

export const purgeMediaDelete =
  (collection: MediaCollection): CollectionAfterDeleteHook =>
  ({ doc, req }) => {
    purge(req, mediaTags(collection, doc.id))
    return doc
  }

// The profile feeds every page's layout.
export const purgeProfileChange: GlobalAfterChangeHook = ({ doc, req }) => {
  if (doc._status === 'published') purge(req, [LAYOUT_TAG])
  return doc
}
