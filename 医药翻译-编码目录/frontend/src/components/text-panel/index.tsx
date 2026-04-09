import { toast } from 'sonner'

import TextComposeMode from '@/components/text-panel/text-compose-mode'
import TextWorkspaceMode from '@/components/text-panel/text-workspace-mode'
import { useTextTranslation } from '@/hooks/use-text-translation'

export default function TextPanel() {
  const {
    sourceText,
    translatedText,
    sourceLang,
    targetLang,
    detectedLang,
    status,
    error,
    canSubmit,
    setSourceText,
    setLanguages,
    submit,
    retry,
  } = useTextTranslation()

  const showWorkspaceLayout = status !== 'idle'
  const sameLanguage = Boolean((sourceLang === targetLang || detectedLang === targetLang) && sourceText.trim())

  const handleSubmit = async () => {
    try {
      await submit()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '文本翻译失败')
    }
  }

  return (
    <div className="panel-block">
      {showWorkspaceLayout ? (
        <TextWorkspaceMode
          sourceText={sourceText}
          translatedText={translatedText}
          sourceLang={sourceLang}
          targetLang={targetLang}
          error={error}
          sameLanguage={sameLanguage}
          canSubmit={canSubmit}
          status={status}
          onSourceTextChange={setSourceText}
          onSourceLangChange={(value) => setLanguages(value, targetLang)}
          onTargetLangChange={(value) => setLanguages(sourceLang, value)}
          onSubmit={handleSubmit}
          onRetry={() => retry()}
        />
      ) : (
        <TextComposeMode
          sourceText={sourceText}
          sameLanguage={sameLanguage}
          error={error}
          canSubmit={canSubmit}
          status={status}
          onSourceTextChange={setSourceText}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
