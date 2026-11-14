'use client'

import { useTranslation } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Scheduled publishes are picked up by a Vercel Schedule every 15 minutes,
// so the chosen time is a lower bound, not an exact moment.
const TEXT = {
  en: 'Scheduled publishes go live within about 30 minutes of the chosen time.',
  it: "Le pubblicazioni pianificate vanno online entro circa 30 minuti dall'orario scelto.",
}

// Payload's schedule drawer has no slot for extra content, so the note is portalled into it.
const SCHEDULER = '.schedule-publish__scheduler'

function Note() {
  const { i18n } = useTranslation()
  return (
    <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, lineHeight: 1.4, margin: '0 0 calc(var(--base) * 0.8)' }}>
      {i18n.language?.startsWith('it') ? TEXT.it : TEXT.en}
    </p>
  )
}

/** Renders the note inside the schedule drawer whenever it is open. */
export function ScheduleNoteInDrawer() {
  const [target, setTarget] = useState<Element | null>(null)
  useEffect(() => {
    const find = () => setTarget(document.querySelector(SCHEDULER))
    find()
    const observer = new MutationObserver(find)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return target ? createPortal(<Note />, target) : null
}

/** Inline variant, for the demo account, whose schedule button is disabled. */
export function ScheduleNote() {
  return <Note />
}
