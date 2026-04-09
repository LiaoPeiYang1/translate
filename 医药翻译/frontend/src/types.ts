export type ViewMode = "text" | "file";
export type HistoryType = "text" | "file";
export type FileStatus = "queued" | "translating" | "done" | "failed" | "cancelled";
export type TextTranslateStatus = "idle" | "success" | "failed";
export type AuthProvider = "password" | "feishu";

export type HistoryItem = {
  id: string;
  type: HistoryType;
  title: string;
  status: string;
  sourceLang: string;
  targetLang: string;
  updatedAt: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  avatarUrl: string;
  openId: string;
  unionId: string;
  userId: string;
};

export type FeishuStatus = {
  enabled: boolean;
  redirectUri: string;
  scope: string;
};

export type SupportedLanguage = {
  code: string;
  label: string;
};
