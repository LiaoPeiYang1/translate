import { Typography } from 'antd'
import { Bot } from 'lucide-react'

export default function LoginHero() {
  return (
    <div className="login-headline">
      <div className="login-brand-mark">
        <Bot size={18} />
      </div>
      <span className="brand-kicker">Medical Translation Workspace</span>
      <Typography.Title level={2} className="login-title">
        医药翻译
      </Typography.Title>
      <Typography.Paragraph>
        面向企业内部的文本与文件翻译工作台，支持多语种翻译、术语库约束和历史记录管理。
      </Typography.Paragraph>
    </div>
  )
}
