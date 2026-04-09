import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";

import { seedHistory } from "../constants";
import { buildMockTranslation, buildTranslatedFileName, detectLanguage, formatLanguage } from "../utils";
import type { FileStatus, HistoryType, TextTranslateStatus, ViewMode } from "../types";

export function useTranslationWorkspace() {
  const [mode, setMode] = useState<ViewMode>("text");
  const [historyItems, setHistoryItems] = useState(seedHistory);
  const [historyFilter, setHistoryFilter] = useState<HistoryType | "all">("all");
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState("file-1");

  const [textInput, setTextInput] = useState("");
  const [textSourceLang, setTextSourceLang] = useState("auto");
  const [textTargetLang, setTextTargetLang] = useState("en");
  const [textResult, setTextResult] = useState("");
  const [textStatus, setTextStatus] = useState<TextTranslateStatus>("idle");

  const [selectedFileName, setSelectedFileName] = useState("");
  const [fileSourceLang, setFileSourceLang] = useState("auto");
  const [fileTargetLang, setFileTargetLang] = useState("en");
  const [fileStatus, setFileStatus] = useState<FileStatus>("queued");

  const translatedFileName = selectedFileName
    ? buildTranslatedFileName(selectedFileName, fileTargetLang)
    : "";

  const filteredHistory = useMemo(() => {
    return historyItems.filter((item) => {
      if (historyFilter !== "all" && item.type !== historyFilter) {
        return false;
      }
      if (!historyKeyword.trim()) {
        return true;
      }
      return item.title.toLowerCase().includes(historyKeyword.toLowerCase());
    });
  }, [historyFilter, historyItems, historyKeyword]);

  function handleTextTranslate() {
    if (!textInput.trim()) {
      return;
    }

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

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setSelectedFileName(file.name);
    setFileStatus("queued");
  }

  function handleFileTranslate() {
    if (!selectedFileName) {
      return;
    }

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

  return {
    mode,
    historyFilter,
    historyKeyword,
    selectedHistoryId,
    filteredHistory,
    textInput,
    textSourceLang,
    textTargetLang,
    textResult,
    textStatus,
    selectedFileName,
    fileSourceLang,
    fileTargetLang,
    fileStatus,
    translatedFileName,
    setMode,
    setHistoryFilter,
    setHistoryKeyword,
    setSelectedHistoryId,
    setTextInput,
    setTextSourceLang,
    setTextTargetLang,
    setFileSourceLang,
    setFileTargetLang,
    handleTextTranslate,
    handleFileSelect,
    handleFileTranslate
  };
}
