// Helpers of the live-preview route.

export type PreviewTarget = { kind: 'project'; id: string; path: string } | { kind: 'profile'; path: string };

/**
 * `projects/<id>` previews a project, `globals/profile` previews the homepage with the
 * profile's draft. The returned path is what the token is signed over.
 */
export function parsePreviewTarget(param: string | undefined): PreviewTarget | null {
  const path = (param ?? '').replace(/^\/+|\/+$/g, '');
  const project = /^projects\/(\d+)$/.exec(path);
  if (project) return { kind: 'project', id: project[1], path };
  if (path === 'globals/profile') return { kind: 'profile', path };
  return null;
}

/**
 * Never cached, never indexed, and framable by the CMS admin only (the admin shows the page
 * in an iframe). `cmsUrl` is the origin of the CMS.
 */
export function previewHeaders(cmsUrl: string): Record<string, string> {
  return {
    'cache-control': 'private, no-store, max-age=0',
    'cdn-cache-control': 'no-store',
    'vercel-cdn-cache-control': 'no-store',
    'content-security-policy': `frame-ancestors ${new URL(cmsUrl).origin}`,
    'x-robots-tag': 'noindex, nofollow',
  };
}
