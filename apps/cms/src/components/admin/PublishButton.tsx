'use client'

import { Button, PublishButton as DefaultPublishButton, useTranslation } from '@payloadcms/ui'

import { showDemoNotice, useDemo } from './demo'
import { ScheduleNote } from './ScheduleNote'

export function PublishButton(props: Parameters<typeof DefaultPublishButton>[0]) {
  const { isDemo, text } = useDemo()
  const { t } = useTranslation()
  if (!isDemo)
    return (
      <>
        <DefaultPublishButton {...props} />
        <ScheduleNote />
      </>
    )
  return (
    <>
      <Button buttonStyle="primary" size="medium" type="button" onClick={() => showDemoNotice(text.notice)}>
        {props?.label || t('version:publishChanges')}
      </Button>
      {/* Visible so reviewers can see scheduling exists (R17), but it does nothing. */}
      <span title={text.scheduleDisabled}>
        <Button buttonStyle="secondary" size="medium" type="button" disabled>
          {text.schedule}
        </Button>
      </span>
      <ScheduleNote />
    </>
  )
}
