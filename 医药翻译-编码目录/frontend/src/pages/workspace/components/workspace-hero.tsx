import { Typography } from 'antd'
import { Bot } from 'lucide-react'

export default function WorkspaceHero() {
  return (
    <div className="workspace-hero">
      <div className="workspace-hero-icon">
        <Bot size={34} />
      </div>
      <Typography.Title level={3} className="workspace-hero-title">
        智能医药翻译系统
      </Typography.Title>
      <Typography.Paragraph className="workspace-hero-desc">
        支持文本、PDF、Word 文档翻译，完美保留原始排版。
      </Typography.Paragraph>
    </div>
  )
}
