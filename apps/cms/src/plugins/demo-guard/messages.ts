// Shared by the server hooks and the admin components, so no imports here.
export const DEMO_MESSAGES = {
  en: "Demo mode: changes aren't saved",
  it: 'Modalità demo: le modifiche non vengono salvate',
} as const

export const demoMessage = (language?: string) => (language?.startsWith('it') ? DEMO_MESSAGES.it : DEMO_MESSAGES.en)
