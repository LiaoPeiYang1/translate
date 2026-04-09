import type { RefObject } from "react";

import { buildProviderLabel } from "../utils";
import type { AuthUser, HistoryItem, HistoryType } from "../types";

type HistorySidebarProps = {
  historyKeyword: string;
  historyFilter: HistoryType | "all";
  filteredHistory: HistoryItem[];
  selectedHistoryId: string;
  authUser: AuthUser | null;
  authError: string;
  isUserMenuOpen: boolean;
  userMenuRef: RefObject<HTMLDivElement | null>;
  onModeReset: () => void;
  onHistoryKeywordChange: (value: string) => void;
  onHistoryFilterChange: (value: HistoryType | "all") => void;
  onHistorySelect: (historyId: string) => void;
  onToggleUserMenu: () => void;
  onLogout: () => void | Promise<void>;
};

export function HistorySidebar({
  historyKeyword,
  historyFilter,
  filteredHistory,
  selectedHistoryId,
  authUser,
  authError,
  isUserMenuOpen,
  userMenuRef,
  onModeReset,
  onHistoryKeywordChange,
  onHistoryFilterChange,
  onHistorySelect,
  onToggleUserMenu,
  onLogout
}: HistorySidebarProps) {
  return (
    <aside className="history-panel">
      <div className="brand-block">
        <span className="brand-kicker">Medical Language Workspace</span>
        <h1>医药翻译</h1>
        <p>面向企业内部的文本与文件翻译工作台。</p>
      </div>

      <button className="primary-button full-width" onClick={onModeReset}>
        新建翻译
      </button>

      <div className="filter-group">
        <input
          className="search-input"
          placeholder="搜索标题 / 文件名"
          value={historyKeyword}
          onChange={(event) => onHistoryKeywordChange(event.target.value)}
        />
        <div className="segmented">
          <button
            className={historyFilter === "all" ? "active" : ""}
            onClick={() => onHistoryFilterChange("all")}
          >
            全部
          </button>
          <button
            className={historyFilter === "text" ? "active" : ""}
            onClick={() => onHistoryFilterChange("text")}
          >
            文本
          </button>
          <button
            className={historyFilter === "file" ? "active" : ""}
            onClick={() => onHistoryFilterChange("file")}
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
            onClick={() => onHistorySelect(item.id)}
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

      <div className="sidebar-status-card" ref={authUser ? userMenuRef : null}>
        {authUser ? (
          <>
            <button
              className="sidebar-user-trigger"
              type="button"
              onClick={onToggleUserMenu}
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
            >
              <div className="sidebar-user-head">
                {authUser.avatarUrl ? (
                  <img className="user-avatar" src={authUser.avatarUrl} alt={authUser.name} />
                ) : (
                  <div className="user-avatar-fallback">{authUser.name.slice(0, 1)}</div>
                )}
                <div className="sidebar-user-copy">
                  <strong>{authUser.name}</strong>
                  <span>点击可退出登录</span>
                </div>
              </div>
              <span className={`sidebar-user-caret ${isUserMenuOpen ? "open" : ""}`}>v</span>
            </button>
            {isUserMenuOpen ? (
              <div className="sidebar-user-menu" role="menu">
                <div className="sidebar-user-menu-copy">
                  <strong>{authUser.name}</strong>
                  <span>{authUser.email || buildProviderLabel(authUser.provider)}</span>
                </div>
                <button
                  className="sidebar-user-menu-button"
                  type="button"
                  role="menuitem"
                  onClick={onLogout}
                >
                  退出登录
                </button>
              </div>
            ) : null}
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
  );
}
