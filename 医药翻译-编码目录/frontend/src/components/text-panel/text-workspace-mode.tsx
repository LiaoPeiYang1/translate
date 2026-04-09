import { Alert, Button, Select, Typography } from 'antd'
import { ArrowRight, SendHorizonal } from 'lucide-react'

import TextInput from '@/components/text-panel/text-input'
import TextResult from '@/components/text-panel/text-result'
import type { LanguageCode, SupportedLanguageCode } from '@/types'
import { supportedLanguages } from '@/utils/format'

type TextWorkspaceModeProps = {
  sourceText: string
  translatedText: string
  sourceLang: LanguageCode
  targetLang: SupportedLanguageCode
  error: string | null
  sameLanguage: boolean
  canSubmit: boolean
  status: 'idle' | 'loading' | 'success' | 'failed'
  onSourceTextChange: (value: string) => void
  onSourceLangChange: (value: LanguageCode) => void
  onTargetLangChange: (value: SupportedLanguageCode) => void
  onSubmit: () => Promise<void>
  onRetry: () => Promise<void>
}

export default function TextWorkspaceMode({
  sourceText,
  translatedText,
  sourceLang,
  targetLang,
  error,
  sameLanguage,
  canSubmit,
  status,
  onSourceTextChange,
  onSourceLangChange,
  onTargetLangChange,
  onSubmit,
  onRetry,
}: TextWorkspaceModeProps) {
  const handleSubmit = async () => {
    await onSubmit()
  }

  return (
    <div className="text-workspace-grid">
      <section className="text-workspace-pane">
        <div className="text-pane-header">
          <div className="text-pane-label">
            <span className="pane-dot" />
            <Typography.Text strong>原文内容</Typography.Text>
          </div>
          <span className="text-pane-meta">{sourceText.length} 字符</span>
        </div>

        <div className="text-pane-body text-input-shell is-workspace">
          <TextInput value={sourceText} onChange={onSourceTextChange} disabled={status === 'loading'} />
        </div>

        {sameLanguage || error ? (
          <div className="surface-alert-stack">
            {sameLanguage ? <Alert type="warning" message="源语言与目标语言不能相同" showIcon /> : null}
            {error ? <Alert type="error" message={error} showIcon /> : null}
          </div>
        ) : null}

        <div className="text-pane-footer">
          {status === 'failed' ? <Button size="large" onClick={() => void onRetry()}>重试</Button> : null}
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
      </section>

      <section className="text-workspace-pane text-workspace-pane-result">
        <div className="text-toolbar is-workspace">
          <Select
            size="large"
            value={sourceLang}
            className="text-toolbar-select"
            onChange={onSourceLangChange}
            options={[
              { label: '自动检测', value: 'auto' },
              ...supportedLanguages.map((item) => ({ label: item.label, value: item.code })),
            ]}
          />
          <div className="text-toolbar-arrow">
            <ArrowRight size={18} />
          </div>
          <Select
            size="large"
            value={targetLang}
            className="text-toolbar-select"
            onChange={onTargetLangChange}
            options={supportedLanguages.map((item) => ({ label: item.label, value: item.code }))}
          />
        </div>

        <TextResult translatedText={translatedText} status={status} />
      </section>
    </div>
  )
}
