export const env = (name: string): string | undefined => process.env[name] ?? (import.meta.env as Record<string, string | undefined>)[name];

export const cmsUrl = (): string => env('CMS_URL') ?? 'http://localhost:3000';

/** Lets server-to-server requests through Vercel's deployment protection, when a secret is set. */
export const bypassHeader = (): Record<string, string> => {
  const bypass = env('VERCEL_AUTOMATION_BYPASS_SECRET');
  return bypass ? { 'x-vercel-protection-bypass': bypass } : {};
};
