import type { FormEventHandler } from "react";

import type { FeishuStatus } from "../types";

type AuthPanelProps = {
  email: string;
  password: string;
  loggedIn: boolean;
  isAuthenticating: boolean;
  isFeishuStatusLoading: boolean;
  feishuLoginEnabled: boolean;
  feishuButtonLabel: string;
  feishuStatus: FeishuStatus | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: FormEventHandler<HTMLFormElement>;
  onFeishuLogin: () => void;
};

export function AuthPanel({
  email,
  password,
  loggedIn,
  isAuthenticating,
  isFeishuStatusLoading,
  feishuLoginEnabled,
  feishuButtonLabel,
  feishuStatus,
  onEmailChange,
  onPasswordChange,
  onLogin,
  onFeishuLogin
}: AuthPanelProps) {
  return (
    <div className="panel-card panel-card-compact">
      <div className="panel-header">
        <h3>登录与身份</h3>
        <span>{loggedIn ? "已登录" : "未登录"}</span>
      </div>
      <form className="login-form" onSubmit={onLogin}>
        <label>
          邮箱
          <input value={email} onChange={(event) => onEmailChange(event.target.value)} />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="primary-button" type="submit" disabled={isAuthenticating}>
            {isAuthenticating ? "登录中..." : loggedIn ? "已登录" : "邮箱登录"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={onFeishuLogin}
            disabled={isFeishuStatusLoading || !feishuLoginEnabled}
          >
            {feishuButtonLabel}
          </button>
        </div>
        <p className="helper-text login-sso-note">
          {feishuLoginEnabled
            ? `已连接企业统一身份入口，回调地址：${feishuStatus?.redirectUri || "未设置"}`
            : "当前环境尚未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，填写 backend/.env 后即可启用飞书登录。"}
        </p>
      </form>
    </div>
  );
}
