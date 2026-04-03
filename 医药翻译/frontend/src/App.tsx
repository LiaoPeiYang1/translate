import { useEffect, useMemo, useState } from "react";

type ViewMode = "text" | "file";
type HistoryType = "text" | "file";
type FileStatus = "queued" | "translating" | "done" | "failed" | "cancelled";
type AuthProvider = "password" | "feishu";

type HistoryItem = {
  id: string;
  type: HistoryType;
  title: string;
  status: string;
  sourceLang: string;
  targetLang: string;
  updatedAt: string;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  avatarUrl: string;
  openId: string;
  unionId: string;
  userId: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const AUTH_STORAGE_KEY = "medical-translate-auth-user";

const supportedLanguages = [
  { code: "zh", label: "中文" },
  { code: "en", label: "英文" },
  { code: "ja", label: "日文" },
  { code: "ko", label: "韩文" },
  { code: "de", label: "德文" },
  { code: "fr", label: "法文" }
];

const seedHistory: HistoryItem[] = [
  {
    id: "file-1",
    type: "file",
    title: "临床试验方案_v2.docx",
    status: "done",
    sourceLang: "中文",
    targetLang: "英文",
    updatedAt: "2026-04-01 11:30"
  },
  {
    id: "text-1",
    type: "text",
    title: "随机对照试验的主要终点为总生存期",
    status: "success",
    sourceLang: "中文",
    targetLang: "英文",
    updatedAt: "2026-04-01 10:18"
  },
  {
    id: "file-2",
    type: "file",
    title: "SafetySummary.pdf",
    status: "cancelled",
    sourceLang: "英文",
    targetLang: "中文",
    updatedAt: "2026-03-31 18:12"
  }
];

function formatLanguage(code: string) {
  return supportedLanguages.find((item) => item.code === code)?.label ?? code;
}

function detectLanguage(text: string) {
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  return hasCjk ? "zh" : "en";
}

function buildMockTranslation(text: string, sourceLang: string, targetLang: string) {
  const source = formatLanguage(sourceLang);
  const target = formatLanguage(targetLang);
  return `【${source} → ${target}】\n${text}\n\n本结果为项目骨架中的演示译文，用于展示前端结构与交互流。`;
}

function buildTranslatedFileName(filename: string, targetLang: string) {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return `${filename}_${targetLang}`;
  }
  const stem = filename.slice(0, dotIndex);
  const extension = filename.slice(dotIndex);
  const suffix = targetLang === "en" ? "english" : targetLang;
  return `${stem}_${suffix}${extension}`;
}

function buildFallbackName(email: string) {
  return email.split("@")[0] || "演示用户";
}

function buildProviderLabel(provider: AuthProvider) {
  return provider === "feishu" ? "飞书 SSO" : "邮箱账号";
}

export default function App() {
  const [mode, setMode] = useState<ViewMode>("text");
  const [historyItems, setHistoryItems] = useState(seedHistory);
  const [historyFilter, setHistoryFilter] = useState<HistoryType | "all">("all");
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState("file-1");

  const [email, setEmail] = useState("user@example.com");
  const [password, setPassword] = useState("Passw0rd1");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [textInput, setTextInput] = useState("");
  const [textSourceLang, setTextSourceLang] = useState("auto");
  const [textTargetLang, setTextTargetLang] = useState("en");
  const [textResult, setTextResult] = useState("");
  const [textStatus, setTextStatus] = useState<"idle" | "success" | "failed">("idle");

  const [selectedFileName, setSelectedFileName] = useState("");
  const [fileSourceLang, setFileSourceLang] = useState("auto");
  const [fileTargetLang, setFileTargetLang] = useState("en");
  const [fileStatus, setFileStatus] = useState<FileStatus>("queued");
  const translatedFileName = selectedFileName
    ? buildTranslatedFileName(selectedFileName, fileTargetLang)
    : "";
  const loggedIn = Boolean(authUser);

  const filteredHistory = useMemo(() => {
    return historyItems.filter((item) => {
      if (historyFilter !== "all" && item.type !== historyFilter) return false;
      if (!historyKeyword.trim()) return true;
      return item.title.toLowerCase().includes(historyKeyword.toLowerCase());
    });
  }, [historyFilter, historyItems, historyKeyword]);

  useEffect(() => {
    const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }

    const searchParams = new URLSearchParams(window.location.search);
    const loginStatus = searchParams.get("login");
    if (!loginStatus) return;

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

    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) return;
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
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  function handleFeishuLogin() {
    setAuthError("");
    window.location.href = `${API_BASE_URL}/api/auth/feishu/login`;
  }

  function handleTextTranslate() {
    if (!textInput.trim()) return;
    const resolvedSource = textSourceLang === "auto" ? detectLanguage(textInput) : textSourceLang;
    if (resolvedSource === textTargetLang) {
      setTextStatus("failed");
      setTextResult("源语言与目标语言不能相同。");
      return;
    }
    const nextTitle = textInput.slice(0, 50);
    const translated = buildMockTranslation(textInput, resolvedSource, textTargetLang);
    setTextResult(translated);
    setTextStatus("success");
    setHistoryItems((current) => [
      {
        id: `text-${Date.now()}`,
        type: "text",
        title: nextTitle,
        status: "success",
        sourceLang: formatLanguage(resolvedSource),
        targetLang: formatLanguage(textTargetLang),
        updatedAt: "刚刚"
      },
      ...current
    ]);
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    setFileStatus("queued");
  }

  function handleFileTranslate() {
    if (!selectedFileName) return;
    setFileStatus("translating");
    setHistoryItems((current) => [
      {
        id: `file-${Date.now()}`,
        type: "file",
        title: selectedFileName,
        status: "translating",
        sourceLang: formatLanguage(fileSourceLang === "auto" ? "zh" : fileSourceLang),
        targetLang: formatLanguage(fileTargetLang),
        updatedAt: "刚刚"
      },
      ...current
    ]);
    window.setTimeout(() => {
      setFileStatus("done");
      setHistoryItems((current) =>
        current.map((item, index) =>
          index === 0 && item.type === "file"
            ? { ...item, status: "done", updatedAt: "刚刚" }
            : item
        )
      );
    }, 1000);
  }

  return (
    <div className="app-shell">
      <aside className="history-panel">
        <div className="brand-block">
          <span className="brand-kicker">Medical Language Workspace</span>
          <h1>医药翻译</h1>
          <p>面向企业内部的文本与文件翻译工作台。</p>
        </div>

        <button className="primary-button full-width" onClick={() => setMode("text")}>
          新建翻译
        </button>

        <div className="filter-group">
          <input
            className="search-input"
            placeholder="搜索标题 / 文件名"
            value={historyKeyword}
            onChange={(event) => setHistoryKeyword(event.target.value)}
          />
          <div className="segmented">
            <button
              className={historyFilter === "all" ? "active" : ""}
              onClick={() => setHistoryFilter("all")}
            >
              全部
            </button>
            <button
              className={historyFilter === "text" ? "active" : ""}
              onClick={() => setHistoryFilter("text")}
            >
              文本
            </button>
            <button
              className={historyFilter === "file" ? "active" : ""}
              onClick={() => setHistoryFilter("file")}
            >
              文件
            </button>
          </div>
        </div>

        <div className="history-list">
          {filteredHistory.map((item) => (
            <button
              key={item.id}
              className={`history-item ${selectedHistoryId === item.id ? "selected" : ""}`}
              onClick={() => setSelectedHistoryId(item.id)}
            >
              <div className="history-top">
                <span className={`status-dot status-${item.status}`}></span>
                <span>{item.title}</span>
              </div>
              <div className="history-meta">
                <span>{item.sourceLang} → {item.targetLang}</span>
                <span>{item.updatedAt}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="sidebar-status-card">
          {authUser ? (
            <>
              <div className="sidebar-user-head">
                {authUser.avatarUrl ? (
                  <img className="user-avatar" src={authUser.avatarUrl} alt={authUser.name} />
                ) : (
                  <div className="user-avatar-fallback">{authUser.name.slice(0, 1)}</div>
                )}
                <div>
                  <strong>{authUser.name}</strong>
                  <span>{buildProviderLabel(authUser.provider)} 已登录</span>
                </div>
              </div>
              <div className="sidebar-user-grid">
                <div>
                  <span>邮箱</span>
                  <strong>{authUser.email || "飞书未返回邮箱"}</strong>
                </div>
                <div>
                  <span>用户 ID</span>
                  <strong>{authUser.userId || authUser.openId || authUser.id}</strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <strong>AI 翻译系统已就绪</strong>
              <p className="status-note">登录成功后，这里会显示当前飞书账号的用户信息。</p>
            </>
          )}
          {authError ? <p className="auth-error">{authError}</p> : null}
        </div>
      </aside>

      <main className="workspace">
        <section className="hero-card">
          <div>
            <span className="eyebrow">Project Scaffold</span>
            <h2>已按医药翻译功能说明初始化项目骨架</h2>
            <p>
              当前页面用于承接后续的真实 API、术语库接入、文件处理和任务队列能力。
            </p>
          </div>
          <div className="hero-grid">
            <div className="metric-card">
              <strong>支持语种</strong>
              <span>中 / 英 / 日 / 韩 / 德 / 法</span>
            </div>
            <div className="metric-card">
              <strong>文件规则</strong>
              <span>单文件，100MB 以内</span>
            </div>
            <div className="metric-card">
              <strong>结果展示</strong>
              <span>保留原格式 + 同格式英文文档</span>
            </div>
          </div>
        </section>

        <section className="main-grid">
          <div className="panel-card panel-card-compact">
            <div className="panel-header">
              <h3>登录与身份</h3>
              <span>{loggedIn ? "已登录" : "未登录"}</span>
            </div>
            <form className="login-form" onSubmit={handleLogin}>
              <label>
                邮箱
                <input value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                密码
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <div className="button-row">
                <button className="primary-button" type="submit" disabled={isAuthenticating}>
                  {isAuthenticating ? "登录中..." : loggedIn ? "已登录" : "邮箱登录"}
                </button>
                <button className="ghost-button" type="button" onClick={handleFeishuLogin}>
                  飞书 SSO 登录
                </button>
              </div>
            </form>
          </div>

          <div className={`panel-card translator-panel ${mode === "file" ? "file-mode" : ""}`}>
            <div className="panel-header">
              <h3>翻译工作区</h3>
              <div className="segmented">
                <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>
                  文本翻译
                </button>
                <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>
                  文件翻译
                </button>
              </div>
            </div>

            {mode === "text" ? (
              <div className="translator-section">
                <div className="inline-fields">
                  <label>
                    源语言
                    <select value={textSourceLang} onChange={(event) => setTextSourceLang(event.target.value)}>
                      <option value="auto">自动检测</option>
                      {supportedLanguages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    目标语言
                    <select value={textTargetLang} onChange={(event) => setTextTargetLang(event.target.value)}>
                      {supportedLanguages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block-field">
                  待翻译文本
                  <textarea
                    rows={8}
                    maxLength={5000}
                    value={textInput}
                    onChange={(event) => setTextInput(event.target.value)}
                    placeholder="输入医药文本，例如：随机对照试验的主要终点为总生存期。"
                  />
                </label>

                <div className="button-row">
                  <button className="primary-button" type="button" onClick={handleTextTranslate}>
                    开始翻译
                  </button>
                  <span className="helper-text">文本翻译失败时保留历史，并支持原记录重试。</span>
                </div>

                <div className="result-card">
                  <div className="result-header">
                    <strong>结果面板</strong>
                    <span>{textStatus === "idle" ? "待翻译" : textStatus === "success" ? "成功" : "失败"}</span>
                  </div>
                  <pre>{textResult || "这里会展示原文与译文的结果视图。"}</pre>
                </div>
              </div>
            ) : (
              <div className="translator-section translator-section-file">
                <div className="inline-fields">
                  <label>
                    源语言
                    <select value={fileSourceLang} onChange={(event) => setFileSourceLang(event.target.value)}>
                      <option value="auto">自动检测</option>
                      {supportedLanguages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    目标语言
                    <select value={fileTargetLang} onChange={(event) => setFileTargetLang(event.target.value)}>
                      {supportedLanguages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="upload-card">
                  <span>上传 `.docx` 或文本型 `.pdf`</span>
                  <input type="file" accept=".docx,.pdf" onChange={handleFileSelect} />
                  <small>保持段落、表格和页内版式结构，全文翻译为目标语言，默认输出英文版。</small>
                </label>

                <div className="file-summary">
                  <div>
                    <strong>{selectedFileName || "尚未选择文件"}</strong>
                    <span>
                      {selectedFileName
                        ? `状态：${fileStatus} · 输出：${translatedFileName} · 保持原格式并将全部文字翻译为${formatLanguage(fileTargetLang)}`
                        : "输出文件与源文档保持相同格式，默认生成全文英文版。"}
                    </span>
                  </div>
                  <button className="primary-button" type="button" onClick={handleFileTranslate}>
                    发起文件翻译
                  </button>
                </div>

                <div className="preview-card">
                  <strong>原文 / 译文文档预览</strong>
                  <p>译文文档保持原文件格式、版式和分页结构，并将页面中的全部文字翻译为对应英文。</p>
                  <div className="preview-columns">
                    <div className="preview-pane">
                      <span>原文文档</span>
                      <div className="pdf-preview-surface">
                        <p>临床试验方案</p>
                        <p>1. 受试者需在筛选期完成知情同意签署。</p>
                        <p>2. 主要终点为总生存期和无进展生存期。</p>
                        <p>3. 所有实验室检查结果需记录于原始病例报告表。</p>
                      </div>
                    </div>
                    <div className="preview-pane">
                      <span>英文文档</span>
                      <div className="pdf-preview-surface">
                        <p>Clinical Trial Protocol</p>
                        <p>1. Each participant must complete informed consent during screening.</p>
                        <p>2. The primary endpoints are overall survival and progression-free survival.</p>
                        <p>3. All laboratory results must be recorded in the original case report form.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
