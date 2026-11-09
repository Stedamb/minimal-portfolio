'use client'

import { toast, useAuth, useTranslation } from '@payloadcms/ui'

import { DEMO_MESSAGES } from '../../plugins/demo-guard/messages'

const TEXT = {
  en: {
    banner: 'Demo mode: look around and type freely, nothing you change is saved.',
    notice: DEMO_MESSAGES.en,
    schedule: 'Schedule publish',
    scheduleDisabled: 'Scheduling is disabled in demo mode',
  },
  it: {
    banner: 'Modalità demo: esplora e scrivi liberamente, nessuna modifica viene salvata.',
    notice: DEMO_MESSAGES.it,
    schedule: 'Pianifica pubblicazione',
    scheduleDisabled: 'La pianificazione è disattivata in modalità demo',
  },
}

// Marks the notice we raise on purpose, so the provider can tell it from the error
// toast of a blocked autosave (same text) and hide only the latter.
export const NOTICE_CLASS = 'demo-notice-toast'

export function useDemo() {
  const { user } = useAuth()
  const { i18n } = useTranslation()
  const text = i18n.language?.startsWith('it') ? TEXT.it : TEXT.en
  return { isDemo: (user as { role?: string } | null)?.role === 'demo', text }
}

export const showDemoNotice = (message: string) => toast.info(message, { id: 'demo-notice', className: NOTICE_CLASS })
export const demoNoticeTexts: string[] = [DEMO_MESSAGES.en, DEMO_MESSAGES.it]
