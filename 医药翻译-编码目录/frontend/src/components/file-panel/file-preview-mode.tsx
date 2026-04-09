import { lazy, Suspense } from 'react'

import DownloadBar from '@/components/download-bar/index'
import type { FileTask } from '@/types'
import { formatLanguage } from '@/utils/format'

const PdfViewer = lazy(() => import('@/components/file-panel/pdf-viewer'))

type FilePreviewModeProps = {
  activeTask: FileTask
  previewTaskKey?: string
}

export default function FilePreviewMode({ activeTask, previewTaskKey }: FilePreviewModeProps) {
  return (
    <section>
      <DownloadBar taskId={previewTaskKey} title={activeTask.name} targetLang={formatLanguage(activeTask.targetLang)} />

      <Suspense fallback={<div className="viewer-loading">预览加载中...</div>}>
        <div className="pdf-compare-grid">
          <PdfViewer
            title="翻译前 PDF"
            ready={activeTask.status === 'done'}
            endpoint={previewTaskKey ? `/api/translate/source/${previewTaskKey}` : undefined}
            emptyDescription="翻译完成后这里展示原文件 PDF 预览"
          />
          <PdfViewer
            title="翻译后 PDF"
            ready={activeTask.status === 'done'}
            endpoint={previewTaskKey ? `/api/translate/result/${previewTaskKey}` : undefined}
            emptyDescription="翻译完成后这里展示纯译文 PDF 预览"
          />
        </div>
      </Suspense>
    </section>
  )
}
