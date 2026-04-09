import { supportedLanguages } from "./constants";
import type { AuthProvider } from "./types";

export function formatLanguage(code: string) {
  return supportedLanguages.find((item) => item.code === code)?.label ?? code;
}

export function detectLanguage(text: string) {
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  return hasCjk ? "zh" : "en";
}

export function buildMockTranslation(text: string, sourceLang: string, targetLang: string) {
  const source = formatLanguage(sourceLang);
  const target = formatLanguage(targetLang);
  return `【${source} → ${target}】\n${text}\n\n本结果为项目骨架中的演示译文，用于展示前端结构与交互流。`;
}

export function buildTranslatedFileName(filename: string, targetLang: string) {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return `${filename}_${targetLang}`;
  }
  const stem = filename.slice(0, dotIndex);
  const extension = filename.slice(dotIndex);
  const suffix = targetLang === "en" ? "english" : targetLang;
  return `${stem}_${suffix}${extension}`;
}

export function buildFallbackName(email: string) {
  return email.split("@")[0] || "演示用户";
}

export function buildProviderLabel(provider: AuthProvider) {
  return provider === "feishu" ? "飞书 SSO" : "邮箱账号";
}
