'use client'

import { useDemo } from './demo'

export function DemoBanner() {
  const { isDemo, text } = useDemo()
  if (!isDemo) return null
  return (
    <div
      role="status"
      style={{
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        background: 'var(--theme-warning-100, #fef3c7)',
        color: 'var(--theme-warning-900, #78350f)',
        borderBottom: '1px solid var(--theme-warning-300, #fcd34d)',
      }}
    >
      {text.banner}
    </div>
  )
}
