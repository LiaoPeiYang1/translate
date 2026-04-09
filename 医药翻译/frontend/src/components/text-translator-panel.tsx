import { LanguagePairFields } from "./language-pair-fields";
import type { TextTranslateStatus } from "../types";

type TextTranslatorPanelProps = {
  textInput: string;
  textSourceLang: string;
  textTargetLang: string;
  textResult: string;
  textStatus: TextTranslateStatus;
  onTextInputChange: (value: string) => void;
  onTextSourceLangChange: (value: string) => void;
  onTextTargetLangChange: (value: string) => void;
  onTranslate: () => void;
};

export function TextTranslatorPanel({
  textInput,
  textSourceLang,
  textTargetLang,
  textResult,
  textStatus,
  onTextInputChange,
  onTextSourceLangChange,
  onTextTargetLangChange,
  onTranslate
}: TextTranslatorPanelProps) {
  return (
    <div className="translator-section">
      <LanguagePairFields
        sourceLang={textSourceLang}
        targetLang={textTargetLang}
        onSourceLangChange={onTextSourceLangChange}
        onTargetLangChange={onTextTargetLangChange}
      />

      <label className="block-field">
        待翻译文本
        <textarea
          rows={8}
          maxLength={5000}
          value={textInput}
          onChange={(event) => onTextInputChange(event.target.value)}
          placeholder="输入医药文本，例如：随机对照试验的主要终点为总生存期。"
        />
      </label>

      <div className="button-row">
        <button className="primary-button" type="button" onClick={onTranslate}>
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
  );
}
