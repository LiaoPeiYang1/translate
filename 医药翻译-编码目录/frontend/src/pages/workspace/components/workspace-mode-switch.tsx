type WorkspaceModeSwitchProps = {
  mode: 'text' | 'file'
  onModeChange: (mode: 'text' | 'file') => void
}

export default function WorkspaceModeSwitch({ mode, onModeChange }: WorkspaceModeSwitchProps) {
  return (
    <div className="workspace-mode-switch">
      <button
        type="button"
        className={`workspace-mode-button ${mode === 'text' ? 'is-active' : ''}`}
        onClick={() => onModeChange('text')}
      >
        文本翻译
      </button>
      <button
        type="button"
        className={`workspace-mode-button ${mode === 'file' ? 'is-active' : ''}`}
        onClick={() => onModeChange('file')}
      >
        文件翻译
      </button>
    </div>
  )
}
