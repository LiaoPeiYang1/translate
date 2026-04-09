import type { ReactNode } from "react";

import type { ViewMode } from "../types";

type TranslatorWorkspaceProps = {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  textPanel: ReactNode;
  filePanel: ReactNode;
};

export function TranslatorWorkspace({
  mode,
  onModeChange,
  textPanel,
  filePanel
}: TranslatorWorkspaceProps) {
  return (
    <div className={`panel-card translator-panel ${mode === "file" ? "file-mode" : ""}`}>
      <div className="panel-header">
        <h3>翻译工作区</h3>
        <div className="segmented">
          <button className={mode === "text" ? "active" : ""} onClick={() => onModeChange("text")}>
            文本翻译
          </button>
          <button className={mode === "file" ? "active" : ""} onClick={() => onModeChange("file")}>
            文件翻译
          </button>
        </div>
      </div>

      {mode === "text" ? textPanel : filePanel}
    </div>
  );
}
