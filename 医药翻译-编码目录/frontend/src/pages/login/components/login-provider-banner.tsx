import { LogIn, ShieldCheck } from 'lucide-react'

type LoginProviderBannerProps = {
  statusText: string
  disabled: boolean
  onFeishuLogin: () => void
}

export default function LoginProviderBanner({ statusText, disabled, onFeishuLogin }: LoginProviderBannerProps) {
  return (
    <div className="login-highlight">
      <div>
        <ShieldCheck size={18} />
        <span>邮箱密码主登录</span>
      </div>
      <button
        type="button"
        className={`login-highlight-sso ${disabled ? 'is-disabled' : 'is-ready'}`}
        onClick={onFeishuLogin}
        disabled={disabled}
      >
        <LogIn size={18} />
        <span>{statusText}</span>
      </button>
    </div>
  )
}
