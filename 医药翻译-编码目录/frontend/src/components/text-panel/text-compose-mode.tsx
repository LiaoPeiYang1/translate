import { Button, Typography, Alert } from 'antd'
import { SendHorizonal } from 'lucide-react'

import TextInput from '@/components/text-panel/text-input'

type TextComposeModeProps = {
  sourceText: string
  sameLanguage: boolean
  error: string | null
  canSubmit: boolean
  status: 'idle' | 'loading' | 'success' | 'failed'
  onSourceTextChange: (value: string) => void
  onSubmit: () => Promise<void>
}

export default function TextComposeMode({
  sourceText,
  sameLanguage,
  error,
  canSubmit,
  status,
  onSourceTextChange,
  onSubmit,
}: TextComposeModeProps) {
  const handleSubmit = async () => {
    await onSubmit()
  }

  return (
    <div className="mode-panel-center">
      <div className="mode-compose-shell text-compose-shell">
        <div className="text-input-shell is-compose">
          <TextInput value={sourceText} onChange={onSourceTextChange} />
        </div>

        {sameLanguage || error ? (
          <div className="surface-alert-stack">
            {sameLanguage ? <Alert type="warning" message="源语言与目标语言不能相同" showIcon /> : null}
            {error ? <Alert type="error" message={error} showIcon /> : null}
          </div>
        ) : null}

        <div className="compose-footer">
          <Typography.Text type="secondary">{sourceText.length} 字符</Typography.Text>
          <div className="compose-actions">
            <Button
              type="primary"
              size="large"
              icon={<SendHorizonal size={16} />}
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              loading={status === 'loading'}
              className="compose-submit"
            >
              开始翻译
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
