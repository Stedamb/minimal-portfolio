'use client'

import { Button, SaveButton as DefaultSaveButton, useTranslation } from '@payloadcms/ui'

import { showDemoNotice, useDemo } from './demo'

export function SaveButton(props: Parameters<typeof DefaultSaveButton>[0]) {
  const { isDemo, text } = useDemo()
  const { t } = useTranslation()
  if (!isDemo) return <DefaultSaveButton {...props} />
  return (
    <Button buttonStyle="primary" size="medium" type="button" onClick={() => showDemoNotice(text.notice)}>
      {props.label || t('general:save')}
    </Button>
  )
}
