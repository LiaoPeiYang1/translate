import { Typography } from 'antd'
import { Bot } from 'lucide-react'

import type { HistoryItem } from '@/types'

type WorkspaceActiveHeaderProps = {
  item: HistoryItem
}

export default function WorkspaceActiveHeader({ item }: WorkspaceActiveHeaderProps) {
  return (
    <div className="workspace-active-header">
      <div className="workspace-active-title">
        <div className="workspace-active-icon">
          <Bot size={16} />
        </div>
        <div>
          <Typography.Title level={4}>{item.title}</Typography.Title>
          <Typography.Text type="secondary">{item.taskType === 'text' ? '文本翻译模式' : '文件翻译模式'}</Typography.Text>
        </div>
      </div>
      <div className="workspace-active-badge">{item.taskType === 'text' ? 'Text' : 'File'}</div>
    </div>
  )
}
