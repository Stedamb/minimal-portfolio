'use client'

import { useTranslation } from '@payloadcms/ui'

// Scheduled publishes are picked up by a Vercel Schedule every 15 minutes (KTD14, R14),
// so the chosen time is a lower bound, not an exact moment.
const TEXT = {
  en: 'Scheduled publishes go live within about 30 minutes of the chosen time.',
  it: "Le pubblicazioni pianificate vanno online entro circa 30 minuti dall'orario scelto.",
}

export function ScheduleNote() {
  const { i18n } = useTranslation()
  return (
    <span style={{ color: 'var(--theme-elevation-500)', fontSize: 12, lineHeight: 1.3, maxWidth: 200 }}>
      {i18n.language?.startsWith('it') ? TEXT.it : TEXT.en}
    </span>
  )
}
