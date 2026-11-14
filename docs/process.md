# How this was built

This repo started as a static Astro template whose content lived in TypeScript files. It was turned into a Payload CMS project over one long working session with [Claude Code](https://claude.com/claude-code), using the [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) workflow: brainstorm, plan, review the plan, build in small verified units, then simplify, review the code and ship. This page records how that went and the decisions behind it, for anyone reading the code or reusing the approach. [architecture.md](architecture.md) covers how the result works.

## 1. Brainstorm: what to build

The starting request was short: make the template work with Payload. The brainstorm turned it into a set of decisions, each made by the owner:

| Question | Decision |
| --- | --- |
| What is it for? | A showcase of Payload, focused on its newer features (live preview, MCP), that is also the owner's real photography portfolio |
| Shape | An Astro + Payload monorepo, keeping the existing Astro site and its design |
| Rendering | Server-rendered pages, cached on the CDN and refreshed per page when content is published, rather than a static rebuild on every change |
| Features | Photo projects; drafts, versions and scheduling; Italian and English; a contact form defined in the CMS; live preview; an owner-only MCP endpoint |
| A public demo | A demo login anyone can use to explore the admin and live preview, which never saves anything. No nightly reset, since nothing can change. No uploads |
| Hosting | Vercel Hobby, accepting that a scheduled publish can land up to about 30 minutes late |

The "never saves" rule shaped the most work. Hiding buttons is not enough, because published credentials mean anyone can call the API directly. So the guarantee had to hold at the API, in every collection, including the ones plugins add.

## 2. Plan: how to build it

The plan turned those decisions into requirements, acceptance examples ("the demo clicks Publish, sees a notice, and a reload shows the original title"), key technical decisions, and twelve implementation units, each with its files, its approach and the tests that would prove it. Some of the technical decisions:

- **Postgres everywhere**, with PGlite locally, so `pnpm dev` needs no Docker and still runs the production database adapter.
- **A demo guard plugin registered last**, so it wraps every collection, plugin ones included, and refuses writes in `beforeOperation`. The demo keeps `update` access so the edit view stays editable.
- **Cache tags from the previous and new published state**, so a purge also covers pages that stop showing something.
- **Live preview rendered by the real site**, with a signed token instead of admin cookies, and Payload merging the unsaved form state.
- **Roles assignable only by the seed.**

Before any code, the plan went through a document review by separate reviewer agents, each reading it for a different concern (such as coherence and feasibility). Their corrections went into the implementation and test sections before work started. The decisions above stayed as made.

## 3. Build: twelve units

Each unit was handed to a worker agent with a narrow brief: the unit's goal, files, approach and the tests it had to add. The orchestrating session then checked the actual diff, re-ran the tests itself, and made the commit. A unit was committed only after typecheck, the integration tests, the web tests and the build passed on that rerun.

| Unit | Result |
| --- | --- |
| Monorepo and local database | pnpm workspace, PGlite server, one-command `pnpm dev` |
| Payload app | Roles, localization, Blob storage, migrations |
| Content model and seed | Projects, images, videos, profile; sample content |
| Demo guard | Server-side refusal of every demo write, plus the admin notices |
| Site reads from Payload | Every page rendered from CMS content, in two languages |
| Caching and purge | Tagged pages and exact purges on publish |
| Live preview | The real page morphed in as the editor types |
| Scheduled publishing | Jobs run by a Vercel Schedule |
| Contact form | CMS-defined fields with spam and rate-limit checks |
| MCP | Owner-only endpoint with find, create and update tools |
| End-to-end tests | Playwright over the whole stack |
| Deployment and README | Vercel config, docs and the editing recording |

The git history follows these units: one commit per unit, then the fix commits from review.

Issues found along the way, and their fixes:

- The PGlite socket served one connection, which deadlocked Payload's connection pool. It now allows several.
- A hook returning `undefined` kept a role a client tried to set. It returns `null` now, and a test proves a submitted role is dropped.
- Two GraphQL types collided on the name `Video` until the video block got its own name.
- The MCP plugin declares its own plugin order, which would have run it after the demo guard and left its key collection unguarded. The guard's order was raised, and a deliberate regression was run to confirm the test suite catches it.
- The browser tests found no product bugs. Their desktop and phone screenshots showed a cramped contact layout on phones, which was fixed. They also showed that the template's placeholder portrait was a reproduction of a copyrighted artwork, so the seed now uses a CC0 photo.

## 4. Simplify, then review

With every unit in, the change went through two passes.

**Simplification.** Four reviewers looked for duplicated code, quality issues, wasted work and comments. That led to shared helpers for environment reads and locale checks, fetching the profile in parallel with page content, and removing references to the plan that a reader of the repo cannot see.

**Code review.** Nine reviewers read the full diff: correctness, security, adversarial, testing, maintainability, reliability, migrations, MCP and frontend races. An independent validator then re-checked each merged finding against the code before it counted. It confirmed six:

| Finding | Outcome |
| --- | --- |
| The demo could still write preferences through GraphQL by escaping the mutation name in JSON | Fixed: the proxy checks the decoded query, and unparseable or unsupported bodies are refused |
| The demo could create unlimited per-document preference rows | Fixed: per-document keys are acknowledged but not stored |
| After a live-preview update, a click on the hero video played and immediately paused it | Fixed: bound elements are tracked in a `WeakSet`, since a morph strips data attributes |
| A remote seed accepted the example `PAYLOAD_SECRET`, which would leave the service API keys unusable | Fixed: the seed refuses it |
| Account lockout is off for every account | Kept, so nobody can lock the public demo login. Documented, with a Vercel Firewall rule as the protection |
| The contact rate limit is a count followed by a create, so a burst can exceed it | Open; see the known limits in [architecture.md](architecture.md) |

The review also led to fixes beyond the six:
- an encoded-path bypass in the proxy is closed;
- the site's requests to the CMS now time out after 8 seconds;
- the MCP tools for creating images and videos were removed, since an MCP call cannot carry a file;
- the README stopped claiming MCP changes are always drafts.

## 5. Ship

The work went up as one pull request. Its description records the test results, the review run and the findings still open. Deployment itself (two Vercel projects, the Neon database, Blob, secrets, the firewall rule and the first seed) is left to the owner, as the README's production setup describes.

## What carried over well

- **Make the decisions before writing code.** Most later disagreements could be settled by pointing back to a decision already made, such as "the demo never saves" or "Hobby, about 30 minutes".
- **Test the guarantee, not the UI.** The demo guard tests call the API as the demo user. Every bypass the review found was a path those tests didn't reach yet, and each one now has a test.
- **Don't trust a worker's report.** Every unit and every fix was re-run by the orchestrating session before commit. The worker reports were accurate, but this is the step that would catch it if one wasn't.
- **Keep a known limit when the trade-off holds.** Lockout off and the rate-limit race are written down with their reasons instead of being patched over.
