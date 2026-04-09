import type { FileTask, LanguageCode, SupportedLanguageCode } from '@/types'

import FileList from '@/components/file-panel/file-list'
import FileProgress from '@/components/file-panel/file-progress'
import FileUpload from '@/components/file-panel/file-upload'
import LangSelector from '@/components/lang-selector/index'

type FileUploadModeProps = {
  activeTask: FileTask | null
  isBusy: boolean
  sourceLang: LanguageCode
  targetLang: SupportedLanguageCode
  onSourceLangChange: (value: LanguageCode) => void
  onTargetLangChange: (value: SupportedLanguageCode) => void
  onFileSelected: (file: File) => void
  onRemove: () => void
  onRetry: () => void
  onCancel: () => void
}

export default function FileUploadMode({
  activeTask,
  isBusy,
  sourceLang,
  targetLang,
  onSourceLangChange,
  onTargetLangChange,
  onFileSelected,
  onRemove,
  onRetry,
  onCancel,
}: FileUploadModeProps) {
  return (
    <section className="translate-pane translate-pane-full mode-panel-center">
      <LangSelector
        sourceLang={sourceLang}
        targetLang={targetLang}
        onSourceLangChange={onSourceLangChange}
        onTargetLangChange={onTargetLangChange}
        disabled={isBusy}
      />

      <div className="mode-compose-shell">
        <FileUpload disabled={isBusy} onFileSelected={onFileSelected} />
        <FileList
          fileName={activeTask?.name}
          fileSize={activeTask?.size}
          removable={!isBusy && !activeTask?.taskId}
          onRemove={onRemove}
        />
        {activeTask ? (
          <FileProgress
            status={activeTask.status}
            progress={activeTask.uploadProgress}
            error={activeTask.error}
            onRetry={onRetry}
            onCancel={onCancel}
          />
        ) : null}
      </div>
    </section>
  )
}
