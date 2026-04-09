import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  API_BASE_URL,
  AUTH_CALLBACK_QUERY_KEYS,
  AUTH_STORAGE_KEY
} from "../constants";
import { buildFallbackName } from "../utils";
import type { AuthUser, FeishuStatus } from "../types";

export function useAuthSession() {
  const [email, setEmail] = useState("user@example.com");
  const [password, setPassword] = useState("Passw0rd1");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [feishuStatus, setFeishuStatus] = useState<FeishuStatus | null>(null);
  const [isFeishuStatusLoading, setIsFeishuStatusLoading] = useState(true);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }

    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;
    const loginStatus = searchParams.get("login");
    if (!loginStatus) {
      return;
    }

    if (loginStatus === "success" && searchParams.get("provider") === "feishu") {
      const nextUser: AuthUser = {
        id:
          searchParams.get("id") ||
          searchParams.get("open_id") ||
          searchParams.get("user_id") ||
          "feishu-user",
        name: searchParams.get("name") || "飞书用户",
        email: searchParams.get("email") || "",
        provider: "feishu",
        avatarUrl: searchParams.get("avatar_url") || "",
        openId: searchParams.get("open_id") || "",
        unionId: searchParams.get("union_id") || "",
        userId: searchParams.get("user_id") || ""
      };
      setAuthUser(nextUser);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
      setAuthError("");
    } else if (loginStatus === "error") {
      setAuthError(searchParams.get("message") || "飞书登录失败，请稍后重试。");
    }

    AUTH_CALLBACK_QUERY_KEYS.forEach((key) => currentUrl.searchParams.delete(key));
    const cleanedSearch = currentUrl.searchParams.toString();
    const cleanedUrl = `${currentUrl.pathname}${cleanedSearch ? `?${cleanedSearch}` : ""}${currentUrl.hash}`;
    window.history.replaceState({}, document.title, cleanedUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFeishuStatus() {
      setIsFeishuStatusLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/feishu/status`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || "无法获取飞书登录配置。");
        }
        if (cancelled) {
          return;
        }
        setFeishuStatus({
          enabled: Boolean(payload.data?.enabled),
          redirectUri: payload.data?.redirect_uri || "",
          scope: payload.data?.scope || ""
        });
      } catch {
        if (cancelled) {
          return;
        }
        setFeishuStatus({
          enabled: false,
          redirectUri: "",
          scope: ""
        });
      } finally {
        if (!cancelled) {
          setIsFeishuStatusLoading(false);
        }
      }
    }

    void loadFeishuStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isUserMenuOpen]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !password) {
      return;
    }

    setIsAuthenticating(true);
    setAuthError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "登录失败，请检查邮箱和密码。");
      }

      const nextUser: AuthUser = {
        id: payload.data?.user?.id || `email-${Date.now()}`,
        name: payload.data?.user?.name || buildFallbackName(email),
        email: payload.data?.user?.email || email,
        provider: "password",
        avatarUrl: payload.data?.user?.avatar_url || "",
        openId: "",
        unionId: "",
        userId: payload.data?.user?.id || ""
      };

      setAuthUser(nextUser);
      setIsUserMenuOpen(false);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  function handleFeishuLogin() {
    if (!feishuStatus?.enabled) {
      setAuthError("飞书 SSO 尚未配置，请先在 backend/.env 中填写飞书应用信息。");
      return;
    }

    setAuthError("");
    const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const nextUrl = new URL(`${API_BASE_URL}/api/auth/feishu/login`);
    nextUrl.searchParams.set("redirect", redirect || "/");
    nextUrl.searchParams.set("origin", window.location.origin);
    window.location.href = nextUrl.toString();
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST"
      });
    } catch {
      // Ignore logout errors and clear local state anyway.
    } finally {
      setAuthUser(null);
      setIsUserMenuOpen(false);
      setAuthError("");
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  const loggedIn = Boolean(authUser);
  const feishuLoginEnabled = Boolean(feishuStatus?.enabled);
  const feishuButtonLabel = isFeishuStatusLoading
    ? "检查飞书配置..."
    : feishuLoginEnabled
      ? "飞书 SSO 登录"
      : "飞书 SSO 未配置";

  return {
    email,
    password,
    authUser,
    authError,
    isAuthenticating,
    isUserMenuOpen,
    feishuStatus,
    isFeishuStatusLoading,
    userMenuRef,
    loggedIn,
    feishuLoginEnabled,
    feishuButtonLabel,
    setEmail,
    setPassword,
    setIsUserMenuOpen,
    handleLogin,
    handleFeishuLogin,
    handleLogout
  };
}
