'use client'

import { useEffect, type ReactNode } from 'react'

import { demoNoticeTexts, NOTICE_CLASS, showDemoNotice, useDemo } from './demo'

// Demo role only. The server rejects every autosave and the admin would toast each
// rejection, so those toasts are hidden. A deliberate save is never silent: the Save
// and Publish buttons (and Cmd/Ctrl+S) raise a notice of their own.
export function DemoProvider({ children }: { children: ReactNode }) {
  const { isDemo, text } = useDemo()

  useEffect(() => {
    if (!isDemo) return

    const hideBlockedAutosave = (el: Element) => {
      const toasts = el.matches('[data-sonner-toast]') ? [el] : Array.from(el.querySelectorAll('[data-sonner-toast]'))
      for (const toast of toasts) {
        const isDemoError = demoNoticeTexts.some((message) => toast.textContent?.includes(message))
        if (isDemoError && !toast.classList.contains(NOTICE_CLASS)) (toast as HTMLElement).style.display = 'none'
      }
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) mutation.addedNodes.forEach((node) => node instanceof Element && hideBlockedAutosave(node))
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        showDemoNotice(text.notice)
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isDemo, text.notice])

  return <>{children}</>
}
