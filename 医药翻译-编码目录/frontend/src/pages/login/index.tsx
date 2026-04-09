import { Card } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { API_BASE_URL } from '@/api/config'
import { getFeishuSsoStatus } from '@/api/auth'
import LoginAuthForm from '@/pages/login/components/login-auth-form'
import LoginHero from '@/pages/login/components/login-hero'
import LoginProviderBanner from '@/pages/login/components/login-provider-banner'
import { useAuthStore } from '@/store/auth'

const DEMO_ACCOUNT = {
  email: 'demo@example.com',
  password: 'Passw0rd1',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, setSession } = useAuthStore()
  const [isFeishuReady, setIsFeishuReady] = useState(false)
  const [isFeishuLoading, setIsFeishuLoading] = useState(true)

  const redirect = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('redirect') || '/workspace'
  }, [location.search])

  useEffect(() => {
    let cancelled = false

    const search = new URLSearchParams(location.search)
    const loginStatus = search.get('login')
    if (loginStatus) {
      if (loginStatus === 'success' && search.get('provider') === 'feishu') {
        const accessToken = search.get('access_token')
        const refreshToken = search.get('refresh_token')
        const expiresAt = Number(search.get('expires_at') || '0')
        const userId = search.get('user_id')

        if (accessToken && refreshToken && expiresAt && userId) {
          setSession(
            {
              userId,
              name: search.get('name') || '飞书用户',
              email: search.get('email') || `${userId}@feishu.local`,
              avatar: search.get('avatar') || undefined,
            },
            {
              accessToken,
              refreshToken,
              expiresAt: expiresAt * 1000,
            },
          )
          toast.success('飞书登录成功')
          navigate(redirect, { replace: true })
          return
        }

        toast.error('飞书登录返回数据不完整，请重试')
      }

      if (loginStatus === 'error') {
        toast.error(search.get('message') || '飞书登录失败，请稍后重试')
      }

      const cleanSearch = new URLSearchParams(location.search)
      ;[
        'login',
        'provider',
        'message',
        'user_id',
        'name',
        'email',
        'avatar',
        'access_token',
        'refresh_token',
        'expires_at',
      ].forEach((key) => cleanSearch.delete(key))
      navigate(
        {
          pathname: location.pathname,
          search: cleanSearch.toString() ? `?${cleanSearch.toString()}` : '',
        },
        { replace: true },
      )
    }

    const loadFeishuStatus = async () => {
      setIsFeishuLoading(true)
      try {
        const status = await getFeishuSsoStatus()
        if (!cancelled) {
          setIsFeishuReady(status.enabled)
        }
      } catch {
        if (!cancelled) {
          setIsFeishuReady(false)
        }
      } finally {
        if (!cancelled) {
          setIsFeishuLoading(false)
        }
      }
    }

    void loadFeishuStatus()
    return () => {
      cancelled = true
    }
  }, [location.pathname, location.search, navigate, redirect, setSession])

  const handleFinish = async (values: { email: string; password: string }) => {
    try {
      await login(values)
      toast.success('登录成功')
      navigate(redirect, { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败，请重试')
    }
  }

  const handleFeishuLogin = () => {
    if (!isFeishuReady) {
      toast.error('当前环境尚未启用飞书 SSO')
      return
    }
    const nextUrl = new URL(`${API_BASE_URL}/api/auth/feishu/login`, window.location.origin)
    nextUrl.searchParams.set('redirect', redirect)
    nextUrl.searchParams.set('origin', window.location.origin)
    window.location.href = nextUrl.toString()
  }

  const feishuStatusText = isFeishuLoading ? '飞书 SSO 检测中' : isFeishuReady ? '飞书 SSO 已启用' : '飞书 SSO 未配置'

  return (
    <div className="login-shell">
      <div className="login-backdrop" />
      <Card className="login-card" bordered={false}>
        <LoginHero />
        <LoginProviderBanner statusText={feishuStatusText} disabled={isFeishuLoading || !isFeishuReady} onFeishuLogin={handleFeishuLogin} />
        <LoginAuthForm
          initialValues={DEMO_ACCOUNT}
          isLoading={isLoading}
          isFeishuReady={isFeishuReady}
          isFeishuLoading={isFeishuLoading}
          onFinish={handleFinish}
          onFeishuLogin={handleFeishuLogin}
        />
      </Card>
    </div>
  )
}
