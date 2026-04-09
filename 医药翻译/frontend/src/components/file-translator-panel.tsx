import type { ChangeEventHandler } from "react";

import { formatLanguage } from "../utils";
import type { FileStatus } from "../types";
import { LanguagePairFields } from "./language-pair-fields";

type FileTranslatorPanelProps = {
  selectedFileName: string;
  fileSourceLang: string;
  fileTargetLang: string;
  fileStatus: FileStatus;
  translatedFileName: string;
  onFileSourceLangChange: (value: string) => void;
  onFileTargetLangChange: (value: string) => void;
  onFileSelect: ChangeEventHandler<HTMLInputElement>;
  onTranslate: () => void;
};

export function FileTranslatorPanel({
  selectedFileName,
  fileSourceLang,
  fileTargetLang,
  fileStatus,
  translatedFileName,
  onFileSourceLangChange,
  onFileTargetLangChange,
  onFileSelect,
  onTranslate
}: FileTranslatorPanelProps) {
  return (
    <div className="translator-section translator-section-file">
      <LanguagePairFields
        sourceLang={fileSourceLang}
        targetLang={fileTargetLang}
        onSourceLangChange={onFileSourceLangChange}
        onTargetLangChange={onFileTargetLangChange}
      />

      <label className="upload-card">
        <span>上传 `.docx` 或文本型 `.pdf`</span>
        <input type="file" accept=".docx,.pdf" onChange={onFileSelect} />
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
        <button className="primary-button" type="button" onClick={onTranslate}>
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
  );
}
