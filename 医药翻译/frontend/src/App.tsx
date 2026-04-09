import { AuthPanel } from "./components/auth-panel";
import { FileTranslatorPanel } from "./components/file-translator-panel";
import { HeroCard } from "./components/hero-card";
import { HistorySidebar } from "./components/history-sidebar";
import { TextTranslatorPanel } from "./components/text-translator-panel";
import { TranslatorWorkspace } from "./components/translator-workspace";
import { useAuthSession } from "./hooks/use-auth-session";
import { useTranslationWorkspace } from "./hooks/use-translation-workspace";

export default function App() {
  const auth = useAuthSession();
  const workspace = useTranslationWorkspace();

  return (
    <div className="app-shell">
      <HistorySidebar
        historyKeyword={workspace.historyKeyword}
        historyFilter={workspace.historyFilter}
        filteredHistory={workspace.filteredHistory}
        selectedHistoryId={workspace.selectedHistoryId}
        authUser={auth.authUser}
        authError={auth.authError}
        isUserMenuOpen={auth.isUserMenuOpen}
        userMenuRef={auth.userMenuRef}
        onModeReset={() => workspace.setMode("text")}
        onHistoryKeywordChange={workspace.setHistoryKeyword}
        onHistoryFilterChange={workspace.setHistoryFilter}
        onHistorySelect={workspace.setSelectedHistoryId}
        onToggleUserMenu={() => auth.setIsUserMenuOpen((current) => !current)}
        onLogout={auth.handleLogout}
      />

      <main className="workspace">
        <HeroCard />

        <section className="main-grid">
          <AuthPanel
            email={auth.email}
            password={auth.password}
            loggedIn={auth.loggedIn}
            isAuthenticating={auth.isAuthenticating}
            isFeishuStatusLoading={auth.isFeishuStatusLoading}
            feishuLoginEnabled={auth.feishuLoginEnabled}
            feishuButtonLabel={auth.feishuButtonLabel}
            feishuStatus={auth.feishuStatus}
            onEmailChange={auth.setEmail}
            onPasswordChange={auth.setPassword}
            onLogin={auth.handleLogin}
            onFeishuLogin={auth.handleFeishuLogin}
          />

          <TranslatorWorkspace
            mode={workspace.mode}
            onModeChange={workspace.setMode}
            textPanel={
              <TextTranslatorPanel
                textInput={workspace.textInput}
                textSourceLang={workspace.textSourceLang}
                textTargetLang={workspace.textTargetLang}
                textResult={workspace.textResult}
                textStatus={workspace.textStatus}
                onTextInputChange={workspace.setTextInput}
                onTextSourceLangChange={workspace.setTextSourceLang}
                onTextTargetLangChange={workspace.setTextTargetLang}
                onTranslate={workspace.handleTextTranslate}
              />
            }
            filePanel={
              <FileTranslatorPanel
                selectedFileName={workspace.selectedFileName}
                fileSourceLang={workspace.fileSourceLang}
                fileTargetLang={workspace.fileTargetLang}
                fileStatus={workspace.fileStatus}
                translatedFileName={workspace.translatedFileName}
                onFileSourceLangChange={workspace.setFileSourceLang}
                onFileTargetLangChange={workspace.setFileTargetLang}
                onFileSelect={workspace.handleFileSelect}
                onTranslate={workspace.handleFileTranslate}
              />
            }
          />
        </section>
      </main>
    </div>
  );
}
