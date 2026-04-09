import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import FilePreviewMode from '@/components/file-panel/file-preview-mode'
import FileUploadMode from '@/components/file-panel/file-upload-mode'
import { useFileTranslation } from '@/hooks/use-file-translation'
import type { LanguageCode, SupportedLanguageCode } from '@/types'
import { isActiveFileStatus } from '@/utils/format'

export default function FilePanel() {
  const { currentTask, start, retry, cancel, reset } = useFileTranslation()
  const [sourceLang, setSourceLang] = useState<LanguageCode>('auto')
  const [targetLang, setTargetLang] = useState<SupportedLanguageCode>('en')

  useEffect(() => {
    if (!currentTask) return
    setSourceLang(currentTask.sourceLang)
    setTargetLang(currentTask.targetLang)
  }, [currentTask])

  const activeTask = currentTask
  const isBusy = isActiveFileStatus(activeTask?.status)
  const showPreviewOnly = activeTask?.status === 'done'
  const previewTaskKey = activeTask?.taskId ?? activeTask?.historyId
  const nextHistoryId = useMemo(() => {
    if (!activeTask?.historyId) return undefined
    if (['failed', 'cancelled'].includes(activeTask.status)) return activeTask.historyId
    if (activeTask.status === 'done' && activeTask.sourceLang === sourceLang && activeTask.targetLang === targetLang) {
      return activeTask.historyId
    }
    return undefined
  }, [activeTask, sourceLang, targetLang])

  const handleSelectFile = async (file: File) => {
    if (activeTask && isBusy) {
      toast.error('当前已有文件在处理中，请等待完成后再上传新文件')
      return
    }

    const reuseHistoryId = nextHistoryId
    if (activeTask && !isBusy) reset()

    try {
      await start({
        file,
        sourceLang,
        targetLang,
        historyId: reuseHistoryId,
      })
      toast.success('文件已上传，系统已自动开始翻译')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '文件翻译提交失败')
    }
  }

  const handleRetry = async () => {
    try {
      await retry()
      toast.success('已重新发起翻译')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重试失败')
    }
  }

  const handleCancel = async () => {
    try {
      await cancel()
      toast.success('已取消翻译任务')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '取消失败')
    }
  }

  return (
    <div className="panel-block mode-panel-card">
      {showPreviewOnly ? (
        <FilePreviewMode activeTask={activeTask} previewTaskKey={previewTaskKey} />
      ) : (
        <FileUploadMode
          activeTask={activeTask}
          isBusy={isBusy}
          sourceLang={sourceLang}
          targetLang={targetLang}
          onSourceLangChange={setSourceLang}
          onTargetLangChange={setTargetLang}
          onFileSelected={handleSelectFile}
          onRemove={() => reset()}
          onRetry={handleRetry}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
