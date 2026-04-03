import { Button, Card, Form, Input, Typography } from 'antd'
import { LogIn, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { FEISHU_SSO_ENABLED } from '@/api/config'
import { useAuthStore } from '@/store/auth'

const DEMO_ACCOUNT = {
  email: 'demo@example.com',
  password: 'Passw0rd1',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading } = useAuthStore()

  const redirect = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('redirect') || '/workspace'
  }, [location.search])

  const handleFinish = async (values: { email: string; password: string }) => {
    try {
      await login(values)
      toast.success('登录成功')
      navigate(redirect, { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败，请重试')
    }
  }

  return (
    <div className="login-shell">
      <div className="login-backdrop" />
      <Card className="login-card" bordered={false}>
        <div className="login-headline">
          <span className="brand-kicker">Medical Translation Workspace</span>
          <Typography.Title level={2}>医药翻译</Typography.Title>
          <Typography.Paragraph>
            面向企业内部的文本与文件翻译工作台，支持多语种翻译、术语库约束和历史记录管理。
          </Typography.Paragraph>
        </div>

        <div className="login-highlight">
          <div>
            <ShieldCheck size={18} />
            <span>邮箱密码主登录</span>
          </div>
          <div>
            <LogIn size={18} />
            <span>飞书 SSO 可选</span>
          </div>
        </div>

        <Form layout="vertical" onFinish={handleFinish} initialValues={DEMO_ACCOUNT}>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入合法邮箱地址' }]}
          >
            <Input placeholder="name@company.com" size="large" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '密码至少 8 位' }]}
          >
            <Input.Password placeholder="请输入密码" size="large" />
          </Form.Item>
          <div className="login-actions">
            <Button type="primary" htmlType="submit" size="large" loading={isLoading} block>
              邮箱登录
            </Button>
            {FEISHU_SSO_ENABLED ? (
              <Button size="large" block>
                飞书登录（可选）
              </Button>
            ) : null}
          </div>
        </Form>
      </Card>
    </div>
  )
}
