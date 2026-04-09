import { Button, Form, Input } from 'antd'
import { Mail } from 'lucide-react'

type LoginCredentials = {
  email: string
  password: string
}

type LoginAuthFormProps = {
  initialValues: LoginCredentials
  isLoading: boolean
  isFeishuReady: boolean
  isFeishuLoading: boolean
  onFinish: (values: LoginCredentials) => Promise<void>
  onFeishuLogin: () => void
}

export default function LoginAuthForm({
  initialValues,
  isLoading,
  isFeishuReady,
  isFeishuLoading,
  onFinish,
  onFeishuLogin,
}: LoginAuthFormProps) {
  const handleFinish = (values: LoginCredentials) => {
    void onFinish(values)
  }

  return (
    <Form layout="vertical" onFinish={handleFinish} initialValues={initialValues} className="login-form-shell">
      <Form.Item
        label="邮箱"
        name="email"
        rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入合法邮箱地址' }]}
      >
        <Input placeholder="name@company.com" size="large" prefix={<Mail size={16} />} />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '密码至少 8 位' }]}
      >
        <Input.Password placeholder="请输入密码" size="large" />
      </Form.Item>
      <div className="login-actions">
        <Button type="primary" htmlType="submit" size="large" loading={isLoading} block className="login-primary-button">
          邮箱登录
        </Button>
        <div className="login-sso-section">
          <span className="login-sso-caption">
            {isFeishuReady ? '或使用企业统一身份入口' : '飞书 SSO 需后端完成配置后启用'}
          </span>
          <Button
            size="large"
            block
            className="login-sso-button"
            onClick={onFeishuLogin}
            disabled={isFeishuLoading || !isFeishuReady}
          >
            {isFeishuLoading ? '检查飞书配置...' : '飞书 SSO 登录'}
          </Button>
        </div>
      </div>
    </Form>
  )
}
