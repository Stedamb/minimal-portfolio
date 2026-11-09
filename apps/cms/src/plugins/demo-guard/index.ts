import { timingSafeEqual } from 'node:crypto'
import type { Access, ClientUser, CollectionConfig, Config, GlobalConfig, PayloadRequest, Plugin } from 'payload'

import { hasRole, isReadOnlyRole } from '../../access/roles'
import { rejectDemoScheduledJob, rejectDemoWrites } from './hooks'

// The demo guard (KTD8). One plugin, applied last, that walks every collection and
// global present at config time:
//  1. enforcement: `demo` and `preview` principals are rejected in `beforeOperation`
//     for every write, whatever the access functions say (the demo keeps `update` so
//     the edit view stays editable and live preview works);
//  2. explicit overrides for the paths those hooks don't see: client uploads, the
//     jobs queue, the jobs runner, document locks (the plugin disables them);
//  3. admin UX for the demo role: banner, silenced autosave toasts, Save and Publish
//     notices, a disabled schedule control.
// Preference writes bypass hooks entirely and are bounded by `src/proxy.ts`.

// Hidden from the demo role in the admin and denied in access functions. `users` keeps
// its own read rule (the demo sees itself).
const HIDDEN_FROM_DEMO = ['users', 'form-submissions', 'payload-mcp-api-keys']
const KEEP_OWN_READ = new Set(['users'])

const COMPONENTS = {
  header: '/components/admin/DemoBanner#DemoBanner',
  providers: '/components/admin/DemoProvider#DemoProvider',
  save: '/components/admin/SaveButton#SaveButton',
  saveDraft: '/components/admin/SaveDraftButton#SaveDraftButton',
  publish: '/components/admin/PublishButton#PublishButton',
}

const defaultAccess: Access = ({ req }) => Boolean(req.user)
const denyReadOnly =
  (access: Access | undefined): Access =>
  (args) =>
    isReadOnlyRole(args.req.user) ? false : (access ?? defaultAccess)(args)

type Hidden = boolean | ((args: { user: ClientUser }) => boolean) | undefined
const hideFromDemo = (hidden: Hidden): Hidden =>
  hidden === true ? true : (args) => isReadOnlyRole(args.user as { role?: string }) || (typeof hidden === 'function' ? hidden(args) : false)

const hasDrafts = (entity: { versions?: unknown }) => Boolean((entity.versions as { drafts?: unknown } | undefined)?.drafts)

function guardCollection(collection: CollectionConfig): CollectionConfig {
  const hide = HIDDEN_FROM_DEMO.includes(collection.slug)
  const edit = collection.admin?.components?.edit ?? {}
  const buttons = hasDrafts(collection)
    ? { SaveDraftButton: COMPONENTS.saveDraft, PublishButton: COMPONENTS.publish }
    : { SaveButton: COMPONENTS.save }
  return {
    ...collection,
    // A lock would let the demo account keep the owner out of a document.
    lockDocuments: false,
    hooks: { ...collection.hooks, beforeOperation: [rejectDemoWrites, ...(collection.hooks?.beforeOperation ?? [])] },
    access: {
      ...collection.access,
      create: denyReadOnly(collection.access?.create),
      delete: denyReadOnly(collection.access?.delete),
      ...(hide && !KEEP_OWN_READ.has(collection.slug)
        ? { read: denyReadOnly(collection.access?.read), update: denyReadOnly(collection.access?.update) }
        : {}),
    },
    admin: {
      ...collection.admin,
      ...(hide ? { hidden: hideFromDemo(collection.admin?.hidden) } : {}),
      components: { ...collection.admin?.components, edit: { ...buttons, ...edit } },
    },
  }
}

function guardGlobal(global: GlobalConfig): GlobalConfig {
  const elements = global.admin?.components?.elements ?? {}
  const buttons = hasDrafts(global)
    ? { SaveDraftButton: COMPONENTS.saveDraft, PublishButton: COMPONENTS.publish }
    : { SaveButton: COMPONENTS.save }
  return {
    ...global,
    lockDocuments: false,
    hooks: { ...global.hooks, beforeOperation: [rejectDemoWrites, ...(global.hooks?.beforeOperation ?? [])] },
    admin: { ...global.admin, components: { ...global.admin?.components, elements: { ...buttons, ...elements } } },
  }
}

// `jobs.access.run` is open to every signed-in user by default. Only the owner, or the
// Vercel cron with `Authorization: Bearer ${CRON_SECRET}`, may run jobs. An unset
// secret never matches.
export const canRunJobs = ({ req }: { req: { user?: unknown; headers: Headers } }): boolean => {
  if (hasRole(req.user as { role?: string } | null, 'owner')) return true
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function guardJobs(jobs: Config['jobs']): Config['jobs'] {
  return {
    ...jobs,
    // Without this the queue writes jobs straight to the database and the hooks below never run.
    runHooks: true,
    access: {
      ...jobs?.access,
      run: canRunJobs,
      queue: async (args: { req: PayloadRequest }) => !isReadOnlyRole(args.req.user) && ((await jobs?.access?.queue?.(args)) ?? true),
      cancel: async (args: { req: PayloadRequest }) => !isReadOnlyRole(args.req.user) && ((await jobs?.access?.cancel?.(args)) ?? true),
    },
    jobsCollectionOverrides: (args) => {
      const base = jobs?.jobsCollectionOverrides?.(args) ?? args.defaultJobsCollection
      return {
        ...base,
        hooks: {
          ...base.hooks,
          beforeOperation: [rejectDemoWrites, ...(base.hooks?.beforeOperation ?? [])],
          beforeValidate: [rejectDemoScheduledJob, ...(base.hooks?.beforeValidate ?? [])],
        },
      }
    },
  }
}

// Used by the Vercel Blob adapter: its default lets every signed-in user ask for an
// upload token, and the adapter also accepts a user who may merely update the collection.
export const clientUploadAccess = ({ req }: { collectionSlug: string; req: { user?: unknown } }): boolean =>
  Boolean(req.user) && !isReadOnlyRole(req.user as { role?: string })

export const demoGuard = (): Plugin => (incoming) => {
  const components = incoming.admin?.components
  return {
    ...incoming,
    collections: (incoming.collections ?? []).map(guardCollection),
    globals: (incoming.globals ?? []).map(guardGlobal),
    jobs: guardJobs(incoming.jobs),
    admin: {
      ...incoming.admin,
      components: {
        ...components,
        header: [...(components?.header ?? []), COMPONENTS.header],
        providers: [...(components?.providers ?? []), COMPONENTS.providers],
      },
    },
  }
}
