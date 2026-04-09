import type { HistoryItem, SupportedLanguage } from "./types";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const AUTH_STORAGE_KEY = "medical-translate-auth-user";
export const AUTH_CALLBACK_QUERY_KEYS = [
  "login",
  "provider",
  "message",
  "id",
  "name",
  "email",
  "avatar_url",
  "open_id",
  "union_id",
  "user_id"
] as const;

export const supportedLanguages: SupportedLanguage[] = [
  { code: "zh", label: "中文" },
  { code: "en", label: "英文" },
  { code: "ja", label: "日文" },
  { code: "ko", label: "韩文" },
  { code: "de", label: "德文" },
  { code: "fr", label: "法文" }
];

export const seedHistory: HistoryItem[] = [
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
