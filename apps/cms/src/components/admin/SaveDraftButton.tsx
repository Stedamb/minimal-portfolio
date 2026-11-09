'use client'

import { Button, SaveDraftButton as DefaultSaveDraftButton, useTranslation } from '@payloadcms/ui'

import { showDemoNotice, useDemo } from './demo'

export function SaveDraftButton(props: Parameters<typeof DefaultSaveDraftButton>[0]) {
  const { isDemo, text } = useDemo()
  const { t } = useTranslation()
  if (!isDemo) return <DefaultSaveDraftButton {...props} />
  return (
    <Button buttonStyle="secondary" size="medium" type="button" onClick={() => showDemoNotice(text.notice)}>
      {t('version:saveDraft')}
    </Button>
  )
}
